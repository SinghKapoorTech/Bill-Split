/**
 * Firebase Cloud Functions for Divit
 *
 * Securely handles Gemini AI API calls server-side to protect API keys
 * and manages trip invitations
 */

// MUST be the first import: it applies the global maxInstances ceiling, and
// firebase-functions snapshots global options when each function is DEFINED.
// Any module imported before this one registers its triggers uncapped.
import './globalOptions.js';

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { logger } from 'firebase-functions';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { defineSecret } from 'firebase-functions/params';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';

// Initialize Firebase Admin
initializeApp();

// Define secret for Gemini API key
const geminiApiKey = defineSecret('GEMINI_API_KEY');

/**
 * Hard ceiling on the inbound receipt payload, in bytes of DECODED image data.
 *
 * This is a cost/abuse safety net, not a quality limit. Sizing rationale:
 *  - Web uploads are compressed to ~1MB client-side (`useFileUpload.ts`).
 *  - Native camera captures are NOT compressed (`useImagePicker.ts` uses
 *    `Camera.getPhoto({ quality: 90 })` with no width cap) and legitimately
 *    produce 3–7MB on a modern phone. A tighter cap would reject real scans.
 *  - Firebase callables reject >10MB requests at the platform layer anyway.
 * So this bounds a hostile caller without breaking the native scan path.
 */
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

/**
 * Represents a single line item on the bill
 */
interface BillItem {
  id?: string;
  name: string;
  price: number;
}

/**
 * Complete bill data structure returned from extraction
 */
interface BillData {
  items: BillItem[];
  subtotal: number;
  tax: number;
  tip: number;
  otherFees: number;
  total: number;
  restaurantName?: string;
}

/**
 * Request data for analyzeBill function
 */
interface AnalyzeBillRequest {
  base64Image: string;
}

/**
 * Cloud Function: Analyze restaurant bill using Gemini AI
 *
 * This function receives a base64-encoded image of a receipt,
 * sends it to Google Gemini AI for analysis, and returns structured bill data.
 *
 * The Gemini API key is stored securely in Firebase secrets and never exposed to clients.
 */
export const analyzeBill = onCall<AnalyzeBillRequest>(
  {
    secrets: [geminiApiKey],
    timeoutSeconds: 120,
    memory: '512MiB',
    // Tighter than the global ceiling: every instance is a paid Gemini call,
    // so this is the one function where runaway concurrency costs real money
    // per invocation rather than just compute time.
    maxInstances: 10,
  },
  async (request) => {
    // Validate request
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    const { base64Image } = request.data;

    if (!base64Image || typeof base64Image !== 'string') {
      throw new HttpsError('invalid-argument', 'base64Image must be a non-empty string');
    }

    if (!base64Image.startsWith('data:image/')) {
      throw new HttpsError(
        'invalid-argument',
        'base64Image must be a data URI with image MIME type',
      );
    }

    // Reject oversized payloads BEFORE spending a Gemini call on them. Base64
    // inflates by 4/3, so decoded bytes ≈ (length of the data segment) * 3/4.
    const commaIndex = base64Image.indexOf(',');
    if (commaIndex === -1) {
      throw new HttpsError(
        'invalid-argument',
        'base64Image must be a data URI with a base64 payload',
      );
    }
    const approxBytes = Math.floor(((base64Image.length - commaIndex - 1) * 3) / 4);
    if (approxBytes > MAX_IMAGE_BYTES) {
      logger.warn('analyzeBill: payload rejected as oversized', {
        uid: request.auth.uid,
        approxBytes,
        limit: MAX_IMAGE_BYTES,
      });
      throw new HttpsError(
        'invalid-argument',
        `Image is too large (${Math.round(approxBytes / 1024 / 1024)}MB). Maximum is ${MAX_IMAGE_BYTES / 1024 / 1024}MB.`,
      );
    }

    try {
      // Initialize Gemini AI with secret API key
      const genAI = new GoogleGenerativeAI(geminiApiKey.value());
      const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash-lite' });

      const prompt = `Extract restaurant bill data from this image. Return ONLY valid JSON (no markdown):

{
  "restaurantName": "Restaurant Name",
  "items": [{"name": "Item", "price": 10.99}],
  "subtotal": 50.00,
  "tax": 4.50,
  "tip": 10.00,
  "total": 68.99
}

Rules:
- Extract the restaurant name if visible; omit or set null if not found
- "items" must contain ONLY food and drink ordered — do NOT include fees, taxes, tips, or any charges as items
- Split quantities into separate items (e.g., "2x Burger" → two entries at the individual price)
- Use individual item prices, not totals
- All numeric values must be numbers, never null or strings
- "subtotal" must equal the sum of all item prices
- "total" is the final total printed on the receipt`;

      // Detect MIME type from base64 string
      const mimeMatch = base64Image.match(/^data:([^;]+);base64,/);
      const mimeType = mimeMatch ? mimeMatch[1] : 'image/jpeg';
      const base64Data = base64Image.split(',')[1];

      const imagePart = {
        inlineData: {
          data: base64Data,
          mimeType: mimeType,
        },
      };

      // Call Gemini AI
      const result = await model.generateContent([prompt, imagePart]);
      const response = await result.response;
      const text = response.text();

      // Clean up the response - remove markdown code blocks if present
      let cleanedText = text.trim();
      cleanedText = cleanedText.replace(/^```json\s*/g, '').replace(/^```\s*/g, '');
      cleanedText = cleanedText.replace(/```\s*$/g, '');
      cleanedText = cleanedText.trim();

      console.log('Gemini raw response:', text);
      console.log('Gemini cleaned response:', cleanedText);

      let billData: BillData;
      try {
        billData = JSON.parse(cleanedText);
        console.log('Gemini parsed billData:', JSON.stringify(billData, null, 2));
      } catch (parseError) {
        console.error('JSON parsing failed. Raw response:', cleanedText);
        throw new Error(
          `Failed to parse JSON response: ${parseError instanceof Error ? parseError.message : 'Unknown error'}`,
        );
      }

      // Add unique IDs to each item
      billData.items = billData.items.map((item, index) => ({
        ...item,
        id: `item-${index}-${Date.now()}`,
      }));

      // Validate the data structure
      if (!billData.items || !Array.isArray(billData.items)) {
        console.error('Invalid items array. Full response:', billData);
        throw new Error('Invalid response: items array is missing');
      }

      if (billData.items.length === 0) {
        throw new Error('No items found on the receipt');
      }

      // Validate each item has required fields
      for (const item of billData.items) {
        if (!item.name || typeof item.price !== 'number') {
          console.error('Invalid item:', item);
          throw new Error('Invalid item structure: missing name or price');
        }
      }

      // Normalize tip field - handle null, undefined, or non-numeric values
      if (billData.tip === null || billData.tip === undefined || typeof billData.tip !== 'number') {
        billData.tip = 0;
      }

      // Derive otherFees from the printed total rather than relying on AI extraction
      billData.otherFees = parseFloat(
        Math.max(0, billData.total - billData.subtotal - billData.tax - billData.tip).toFixed(2),
      );

      // Validate numeric fields with detailed error
      if (
        typeof billData.subtotal !== 'number' ||
        typeof billData.tax !== 'number' ||
        typeof billData.tip !== 'number' ||
        typeof billData.total !== 'number'
      ) {
        console.error('Missing numeric fields. Received:', {
          subtotal: billData.subtotal,
          tax: billData.tax,
          tip: billData.tip,
          total: billData.total,
        });
        throw new Error(
          `Invalid response: missing required numeric fields. Received types: subtotal=${typeof billData.subtotal}, tax=${typeof billData.tax}, tip=${typeof billData.tip}, total=${typeof billData.total}`,
        );
      }

      return billData;
    } catch (error) {
      console.error('Error analyzing bill:', error);

      if (error instanceof HttpsError) {
        throw error;
      }

      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw new HttpsError('internal', `Failed to analyze receipt: ${errorMessage}`);
    }
  },
);

/**
 * Request data for inviteMemberToEvent function
 */
interface InviteMemberRequest {
  eventId: string;
  email: string;
}

/**
 * Cloud Function: Invite a member to an event by email
 *
 * This function checks if a user with the given email exists:
 * - If yes: Adds them directly to the event's memberIds
 * - If no: Adds email to pendingInvites for when they sign up
 */
export const inviteMemberToEvent = onCall<InviteMemberRequest>(async (request) => {
  // Validate authentication
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'User must be authenticated');
  }

  const { eventId, email } = request.data;
  const inviterId = request.auth.uid;

  // Validate input
  if (!eventId || !email) {
    throw new HttpsError('invalid-argument', 'eventId and email are required');
  }

  // Validate email format
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    throw new HttpsError('invalid-argument', 'Invalid email format');
  }

  try {
    const db = getFirestore();
    const eventRef = db.collection('events').doc(eventId);
    const eventDoc = await eventRef.get();

    if (!eventDoc.exists) {
      throw new HttpsError('not-found', 'Event not found');
    }

    const eventData = eventDoc.data();

    if (!eventData) {
      throw new HttpsError('not-found', 'Event data not found');
    }

    // Check if inviter is a member of the event
    if (!eventData.memberIds || !eventData.memberIds.includes(inviterId)) {
      throw new HttpsError('permission-denied', 'Only event members can invite others');
    }

    // Check if user with this email already exists
    let userRecord;
    try {
      const auth = getAuth();
      userRecord = await auth.getUserByEmail(email);
    } catch (error: unknown) {
      // User doesn't exist yet
      if ((error as { code?: string }).code !== 'auth/user-not-found') {
        throw error;
      }
    }

    if (userRecord) {
      // User exists - add them directly to the trip
      const userId = userRecord.uid;

      // Check if already a member
      if (eventData.memberIds.includes(userId)) {
        throw new HttpsError('already-exists', 'User is already a member of this event');
      }

      // Add user to event
      const { FieldValue } = await import('firebase-admin/firestore');
      await eventRef.update({
        memberIds: FieldValue.arrayUnion(userId),
        pendingInvites: FieldValue.arrayRemove(email),
        updatedAt: FieldValue.serverTimestamp(),
      });

      return {
        success: true,
        userExists: true,
        message: `${email} has been added to the event`,
      };
    } else {
      // User doesn't exist - add to pending invites
      const pendingInvites = eventData.pendingInvites || [];

      // Check if already invited
      if (pendingInvites.includes(email)) {
        throw new HttpsError('already-exists', 'This email has already been invited');
      }

      // Get inviter info
      const auth = getAuth();
      const inviterRecord = await auth.getUser(inviterId);
      const inviterName = inviterRecord.displayName || inviterRecord.email || 'Someone';

      // Add to pending invites
      const { FieldValue } = await import('firebase-admin/firestore');
      await eventRef.update({
        pendingInvites: FieldValue.arrayUnion(email),
        updatedAt: FieldValue.serverTimestamp(),
      });

      // Create invitation record
      await db.collection('eventInvitations').add({
        eventId,
        eventName: eventData.name,
        email,
        invitedBy: inviterId,
        invitedByName: inviterName,
        invitedAt: FieldValue.serverTimestamp(),
        status: 'pending',
      });

      // TODO: Send invitation email here using nodemailer or Firebase Extensions
      // For now, we'll just store the invitation

      return {
        success: true,
        userExists: false,
        message: `Invitation sent to ${email}`,
      };
    }
  } catch (error) {
    console.error('Error inviting member:', error);

    if (error instanceof HttpsError) {
      throw error;
    }

    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    throw new HttpsError('internal', `Failed to invite member: ${errorMessage}`);
  }
});

/**
 * Cloud Function: Ledger Pipeline
 *
 * Firestore onDocumentWritten trigger on bills/{billId}.
 * Handles all ledger mutations server-side: balances (authoritative)
 * and event_balances per-pair docs (delta-based).
 */
export { ledgerProcessor } from './ledgerProcessor.js';

/**
 * Cloud Function: Friend Add Processor
 *
 * Firestore onDocumentUpdated trigger on users/{userId}.
 * When a user adds a new friend, retroactively triggers the ledger pipeline
 * for all shared bills between the two users, backfilling balances.
 */
export { friendAddProcessor } from './friendAddProcessor.js';

/**
 * Cloud Function: Event Delete Processor
 *
 * Firestore onDocumentDeleted trigger on events/{eventId}.
 * Cascade-deletes orphaned bills, event_balances pair docs, and invitations.
 * Bill deletions auto-trigger the ledger pipeline to reverse balances.
 */
export { eventDeleteProcessor } from './eventDeleteProcessor.js';

/**
 * Cloud Function: Settle all outstanding bills with a friend.
 *
 * Reads unsettledBillIds from balances, marks each bill settled,
 * zeros the balance, and writes a settlement record — all in one transaction.
 */
export const processSettlement = onCall<import('./settlementProcessor.js').SettleRequest>(
  { timeoutSeconds: 60, memory: '256MiB' },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    const { processSettlementCore } = await import('./settlementProcessor.js');
    return processSettlementCore(request.auth.uid, request.data);
  },
);

/**
 * Cloud Function: Settle all outstanding bills with a friend within a specific event.
 *
 * Reads unsettledBillIds from the event pair balance, marks each bill settled,
 * zeros the event balance, and writes a settlement record — all in one transaction.
 * The balances are updated automatically via the ledgerProcessor flow-through.
 */
export const processEventSettlement = onCall<
  import('./eventSettlementProcessor.js').EventSettleRequest
>({ timeoutSeconds: 60, memory: '256MiB' }, async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'User must be authenticated');
  }

  const { processEventSettlementCore } = await import('./eventSettlementProcessor.js');
  return processEventSettlementCore(request.auth.uid, request.data);
});

/**
 * Cloud Function: Reverse a settlement.
 *
 * Un-settles bills and deletes the settlement record. The ledgerProcessor
 * pipeline auto-fires for each modified bill to recalculate balances.
 */
export const reverseSettlement = onCall<import('./settlementReversal.js').ReversalRequest>(
  { timeoutSeconds: 60, memory: '256MiB' },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    const { processSettlementReversalCore } = await import('./settlementReversal.js');
    return processSettlementReversalCore(request.auth.uid, request.data);
  },
);

/**
 * Cloud Function: Create Bill (Atomic)
 *
 * Atomically creates a bill document and updates friend balances
 * in a single transaction.
 */
export {
  createBill,
  joinBillAsGuest,
  leaveBillAsGuest,
  updateGuestName,
  claimShadowUser,
} from './billFunctions.js';

/**
 * Cloud Function: Recurring Bill Processor
 *
 * Scheduled function that runs every hour. Queries active recurring bill
 * templates whose nextRunDate <= today, creates bills for all due/missed
 * cycles, and advances the schedule.
 */
export { processRecurringBills } from './recurringBillProcessor.js';

/**
 * Cloud Function: Generate a recurring bill's due occurrences immediately.
 *
 * Called by the client right after a template is created or edited so any
 * already-due / overdue cycles are generated at once (with balances updated via
 * the ledger pipeline) instead of waiting up to an hour for the scheduler.
 * Idempotent with the hourly pass.
 */
export const generateRecurringBillNow = onCall<{ recurringBillId: string }>(
  { timeoutSeconds: 120, memory: '512MiB' },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    const { recurringBillId } = request.data;
    if (!recurringBillId) {
      throw new HttpsError('invalid-argument', 'recurringBillId is required');
    }

    try {
      const { generateRecurringBillNowCore } = await import('./recurringBillProcessor.js');
      const db = getFirestore();
      const todayStr = new Date().toISOString().split('T')[0];
      return await generateRecurringBillNowCore(db, recurringBillId, request.auth.uid, todayStr);
    } catch (error) {
      console.error('Failed to generate recurring bill now:', error);
      const message = error instanceof Error ? error.message : 'Unknown error';
      if (message === 'Recurring bill not found') {
        throw new HttpsError('not-found', message);
      }
      if (message === 'Not authorized to generate this recurring bill') {
        throw new HttpsError('permission-denied', message);
      }
      throw new HttpsError('internal', `Failed to generate recurring bill: ${message}`);
    }
  },
);

/**
 * Cloud Function: one-time migration to reconcile event footprints orphaned
 * before processedEventId existed (bills removed from an event pre-deploy whose
 * contribution is stranded in event_balances). Guarded: requires auth AND that
 * the caller's uid matches the MIGRATION_ADMIN_UID env var, so it is inert
 * unless an operator explicitly sets that variable before running it once.
 */
export const reconcileEventFootprints = onCall(
  { timeoutSeconds: 300, memory: '512MiB' },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }
    const adminUid = process.env.MIGRATION_ADMIN_UID;
    if (!adminUid || request.auth.uid !== adminUid) {
      throw new HttpsError('permission-denied', 'Not authorized to run migrations');
    }
    const { reconcileOrphanedEventFootprints } =
      await import('./migrations/reconcileOrphanedEventFootprints.js');
    return reconcileOrphanedEventFootprints(getFirestore());
  },
);

/**
 * Maintainer accounts allowed to run the ledger reconciliation on demand.
 * These are the two owner UIDs; keep in sync if maintainers change.
 */
const ADMIN_UIDS = [
  'RrGSa7ixSSRhUlieYzDQNnExAjx1', // maintainer account (Aakaash)
  'e5do2UHqO2W9M8If4rmfTKiK3VV2', // maintainer account
] as const;

/**
 * Cloud Function: Ledger reconciliation (admin, on demand).
 *
 * Rebuilds `balances` and `event_balances` from the source-of-truth bills,
 * repairing accumulated delta-drift, backfilling anchors, and removing junk
 * docs. Admin-guarded: caller's uid must be in ADMIN_UIDS. Defaults to a dry
 * run (report-only); pass { dryRun: false } to apply. Optional { uidFilter }
 * restricts writes to docs whose participants intersect the given UIDs.
 */
export const reconcileLedger = onCall<{ dryRun?: boolean; uidFilter?: string[] }>(
  { timeoutSeconds: 300, memory: '512MiB' },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }
    if (!ADMIN_UIDS.includes(request.auth.uid as (typeof ADMIN_UIDS)[number])) {
      throw new HttpsError('permission-denied', 'Not authorized to run ledger reconciliation');
    }
    const { reconcileLedgerCore } = await import('./reconciliation/reconcileLedger.js');
    const dryRun = request.data?.dryRun ?? true;
    const uidFilter = request.data?.uidFilter;
    return reconcileLedgerCore(getFirestore(), { dryRun, ...(uidFilter && { uidFilter }) });
  },
);

/**
 * Cloud Function: Scheduled ledger drift report (daily, report-only).
 *
 * Runs reconcileLedgerCore in dry-run mode every day and logs the drift report.
 * NEVER auto-writes — surfacing drift is a signal to run reconcileLedger
 * (dryRun:false) manually after review.
 */
export const scheduledLedgerReconcile = onSchedule(
  { schedule: 'every 24 hours', timeoutSeconds: 300, memory: '512MiB' },
  async () => {
    // NOTE: reconcileLedgerCore reads the full bills/users/events/balances/event_balances
    // collections into memory. This is acceptable at current data size but is a known
    // scaling ceiling — revisit if any of those collections grow large.
    try {
      const { reconcileLedgerCore } = await import('./reconciliation/reconcileLedger.js');
      const report = await reconcileLedgerCore(getFirestore(), { dryRun: true });
      logger.info('scheduledLedgerReconcile drift report', {
        scanned: report.scanned,
        wouldPatch: report.patched,
        wouldZero: report.zeroed,
        wouldDelete: report.deleted,
        wouldStampBills: report.billsStamped,
      });
    } catch (err) {
      logger.error('scheduledLedgerReconcile failed', { error: String(err) });
      // Swallow — a failed dry-run report must not surface as a scheduler error
      // and trigger unnecessary retry/alert-spam.
    }
  },
);

/**
 * Dev-only manual trigger for the recurring-bill generator. Exported ONLY when
 * running under the Firebase emulator so it is never deployed to production.
 * Lets you run a generation pass on demand (the scheduler doesn't fire locally),
 * e.g. curl ".../devTriggerRecurringBills?today=2026-05-30".
 */
import { devTriggerRecurringBills as _devTriggerRecurringBills } from './recurringBillProcessor.js';
export const devTriggerRecurringBills =
  process.env.FUNCTIONS_EMULATOR === 'true' ? _devTriggerRecurringBills : undefined;
