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

export type VenmoOpenStrategy = 'scheme-then-universal' | 'new-tab';

/**
 * Chooses how to hand off to Venmo, per platform.
 *
 * Mobile tries the `venmo://` scheme FIRST and falls back to the web link.
 * That ordering looks wrong for iOS and is not — do not "fix" it to
 * universal-link-first without re-checking the two facts below, both of which
 * were verified against Venmo's live servers on 2026-09-06:
 *
 *  1. `account.venmo.com` claims exactly two paths in its
 *     apple-app-site-association — `/go/checkout/wallet-network` and
 *     `/go/web/paypal`. `/pay` is NOT among them, so
 *     `https://account.venmo.com/pay?...` is not a universal link and iOS will
 *     never route it to the Venmo app, installed or not.
 *  2. That URL then 307s to `venmo.com/account/sign-in`. So universal-link-first
 *     sends every iOS user to a web sign-in page instead of the app, which
 *     breaks the charge flow rather than hardening it.
 *
 * The Guideline 2.1 worry about a "Cannot Open Page" dialog is a mobile-Safari
 * behaviour, not a native-app one: inside Capacitor this navigation is
 * intercepted by WebViewDelegationHandler and handed to `UIApplication.open`,
 * which fails SILENTLY on an unhandled scheme. App Review runs the binary, not
 * the website, so the reviewer never sees a dialog.
 *
 * Note there is deliberately no "is Venmo installed" branch — no such check
 * exists from a web context. `isVenmoInstalled` below only sniffs the user
 * agent and must not be used to gate this.
 *
 * Known gap (pre-existing, not introduced here): a Capacitor WKWebView on iPad
 * defaults to desktop content mode and reports `Macintosh`, so iPad native
 * lands on 'new-tab' rather than the scheme. Fixing that needs Capacitor
 * platform detection, not a user-agent test.
 */
export function getVenmoOpenStrategy(userAgent: string): VenmoOpenStrategy {
  if (/iPhone|iPad|iPod|Android/i.test(userAgent)) return 'scheme-then-universal';
  return 'new-tab';
}

export function openVenmoApp(charge: VenmoCharge): void {
  const universalLink = getVenmoUniversalLink(charge);
  const nativeScheme = getVenmoNativeScheme(charge);

  switch (getVenmoOpenStrategy(navigator.userAgent)) {
    case 'scheme-then-universal':
      window.location.href = nativeScheme;
      setTimeout(() => {
        window.location.href = universalLink;
      }, 2500);
      return;

    case 'new-tab':
      window.open(universalLink, '_blank');
      return;
  }
}

// Kept for backward compatibility
export const constructVenmoDeepLink = getVenmoNativeScheme;
export const getVenmoWebUrl = getVenmoUniversalLink;
export const isVenmoInstalled = () => /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
