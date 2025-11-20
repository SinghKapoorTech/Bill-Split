/**
 * Firebase Cloud Functions for Bill Split
 *
 * Securely handles Gemini AI API calls server-side to protect API keys
 * and manages group invitations
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
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
  total: number;
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
    timeoutSeconds: 60,
    memory: '512MiB',
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
      throw new HttpsError('invalid-argument', 'base64Image must be a data URI with image MIME type');
    }

    try {
      // Initialize Gemini AI with secret API key
      const genAI = new GoogleGenerativeAI(geminiApiKey.value());
      const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash-lite' });

      const prompt = `Extract restaurant bill data from this image. Return ONLY valid JSON (no markdown):

{
  "items": [{"name": "Item", "price": 10.99}],
  "subtotal": 50.00,
  "tax": 4.50,
  "tip": 10.00,
  "total": 64.50
}

Rules:
- Split quantities into separate items (e.g., "2x Burger" = two entries)
- Use individual item prices, not totals
- All values must be numbers`;

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

      let billData: BillData;
      try {
        billData = JSON.parse(cleanedText);
      } catch (parseError) {
        console.error('JSON parsing failed. Raw response:', cleanedText);
        throw new Error(`Failed to parse JSON response: ${parseError instanceof Error ? parseError.message : 'Unknown error'}`);
      }

      // Log the parsed data for debugging
      console.log('Parsed bill data:', JSON.stringify(billData, null, 2));

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
        throw new Error(`Invalid response: missing required numeric fields. Received types: subtotal=${typeof billData.subtotal}, tax=${typeof billData.tax}, tip=${typeof billData.tip}, total=${typeof billData.total}`);
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
  }
);

/**
 * Request data for inviteMemberToGroup function
 */
interface InviteMemberRequest {
  groupId: string;
  email: string;
}

/**
 * Cloud Function: Invite a member to a group by email
 *
 * This function checks if a user with the given email exists:
 * - If yes: Adds them directly to the group's memberIds
 * - If no: Adds email to pendingInvites for when they sign up
 */
export const inviteMemberToGroup = onCall<InviteMemberRequest>(
  async (request) => {
    // Validate authentication
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    const { groupId, email } = request.data;
    const inviterId = request.auth.uid;

    // Validate input
    if (!groupId || !email) {
      throw new HttpsError('invalid-argument', 'groupId and email are required');
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      throw new HttpsError('invalid-argument', 'Invalid email format');
    }

    try {
      const db = getFirestore();
      const groupRef = db.collection('groups').doc(groupId);
      const groupDoc = await groupRef.get();

      if (!groupDoc.exists) {
        throw new HttpsError('not-found', 'Group not found');
      }

      const groupData = groupDoc.data();

      if (!groupData) {
        throw new HttpsError('not-found', 'Group data not found');
      }

      // Check if inviter is a member of the group
      if (!groupData.memberIds || !groupData.memberIds.includes(inviterId)) {
        throw new HttpsError('permission-denied', 'Only group members can invite others');
      }

      // Check if user with this email already exists
      let userRecord;
      try {
        const auth = getAuth();
        userRecord = await auth.getUserByEmail(email);
      } catch (error: any) {
        // User doesn't exist yet
        if (error.code !== 'auth/user-not-found') {
          throw error;
        }
      }

      if (userRecord) {
        // User exists - add them directly to the group
        const userId = userRecord.uid;

        // Check if already a member
        if (groupData.memberIds.includes(userId)) {
          throw new HttpsError('already-exists', 'User is already a member of this group');
        }

        // Add user to group
        const { FieldValue } = await import('firebase-admin/firestore');
        await groupRef.update({
          memberIds: FieldValue.arrayUnion(userId),
          pendingInvites: FieldValue.arrayRemove(email),
          updatedAt: FieldValue.serverTimestamp(),
        });

        return {
          success: true,
          userExists: true,
          message: `${email} has been added to the group`,
        };
      } else {
        // User doesn't exist - add to pending invites
        const pendingInvites = groupData.pendingInvites || [];

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
        await groupRef.update({
          pendingInvites: FieldValue.arrayUnion(email),
          updatedAt: FieldValue.serverTimestamp(),
        });

        // Create invitation record
        await db.collection('groupInvitations').add({
          groupId,
          groupName: groupData.name,
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
  }
);
