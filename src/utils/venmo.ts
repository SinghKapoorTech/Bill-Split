import { VenmoCharge } from '@/types';

/**
 * Builds the "(incl. …)" suffix for a Venmo note, naming only the extras
 * actually present on the bill — a fees-only bill must not claim tax/tip.
 * Returns '' when the bill has no extras.
 */
export function describeIncludedExtras(tax?: number, tip?: number, otherFees?: number): string {
  const extras: string[] = [];
  if ((tax || 0) > 0) extras.push('tax');
  if ((tip || 0) > 0) extras.push('tip');
  if ((otherFees || 0) > 0) extras.push('fees');
  return extras.length > 0 ? ` (incl. ${extras.join('/')})` : '';
}

/**
 * Characters that would let a value break out of its query parameter, plus
 * whitespace. `encodeURIComponent` at the two link builders is what actually
 * closes A-06 — this check exists only to keep obvious garbage out of storage.
 *
 * It is deliberately PERMISSIVE. Venmo's `recipients` parameter accepts a
 * username, an email address, or a phone number, so a strict
 * `[A-Za-z0-9_-]{5,30}` username rule would lock out anyone whose Venmo is
 * reached by email or phone — blocking them from saving their profile at all.
 * Validation that rejects legitimate users is a worse bug than the one it
 * guards against, especially when the real fix is already in place.
 */
const VENMO_UNSAFE_CHARS = /[&?#=/\\<>"'\s]/;
const VENMO_MIN_LENGTH = 3;
const VENMO_MAX_LENGTH = 50;

export function isValidVenmoHandle(handle: string | undefined | null): boolean {
  if (typeof handle !== 'string') return false;
  if (handle.length < VENMO_MIN_LENGTH || handle.length > VENMO_MAX_LENGTH) return false;
  return !VENMO_UNSAFE_CHARS.test(handle);
}

/**
 * Normalizes a user-entered Venmo handle for PERSISTENCE: strips the leading
 * `@` and surrounding whitespace, then returns it only if it is a plausible
 * handle. Returns `undefined` for anything that isn't — callers should omit the
 * field rather than store a value that will later be interpolated into a
 * payment URL. (Firestore rejects `undefined`, so omit via conditional spread.)
 */
export function sanitizeVenmoHandle(handle: string | undefined | null): string | undefined {
  if (typeof handle !== 'string') return undefined;
  const cleaned = handle.trim().replace(/^@+/, '').trim();
  return isValidVenmoHandle(cleaned) ? cleaned : undefined;
}

export function getVenmoUniversalLink(charge: VenmoCharge): string {
  // Every interpolated value must be escaped. `recipientId` is free-text user
  // input and is settable by OTHER users (a friend's `venmoId`), so a raw `&`
  // here lets it append its own `recipients=`/`amount=` — and Venmo honours the
  // LAST occurrence, silently redirecting the payment. See tests/venmo.test.ts.
  const encodedRecipient = encodeURIComponent(charge.recipientId);
  const encodedNote = encodeURIComponent(charge.note);
  const formattedAmount = charge.amount.toFixed(2);
  const txnType = charge.type || 'charge';

  return `https://account.venmo.com/pay?txn=${txnType}&recipients=${encodedRecipient}&amount=${formattedAmount}&note=${encodedNote}&audience=friends`;
}

export function getVenmoNativeScheme(charge: VenmoCharge): string {
  const encodedRecipient = encodeURIComponent(charge.recipientId);
  const encodedNote = encodeURIComponent(charge.note);
  const formattedAmount = charge.amount.toFixed(2);
  const txnType = charge.type || 'charge';

  return `venmo://paycharge?txn=${txnType}&recipients=${encodedRecipient}&amount=${formattedAmount}&note=${encodedNote}`;
}

export function openVenmoApp(charge: VenmoCharge): void {
  const universalLink = getVenmoUniversalLink(charge);
  const nativeScheme = getVenmoNativeScheme(charge);

  const isMobileOS = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

  if (isMobileOS) {
    const startTime = Date.now();
    window.location.href = nativeScheme;

    setTimeout(() => {
      window.location.href = universalLink;
    }, 2500);
  } else {
    window.open(universalLink, '_blank');
  }
}

// Kept for backward compatibility
export const constructVenmoDeepLink = getVenmoNativeScheme;
export const getVenmoWebUrl = getVenmoUniversalLink;
export const isVenmoInstalled = () => /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
