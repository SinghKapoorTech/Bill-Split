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

export function getVenmoUniversalLink(charge: VenmoCharge): string {
  const encodedNote = encodeURIComponent(charge.note);
  const formattedAmount = charge.amount.toFixed(2);
  const txnType = charge.type || 'charge';

  return `https://account.venmo.com/pay?txn=${txnType}&recipients=${charge.recipientId}&amount=${formattedAmount}&note=${encodedNote}&audience=friends`;
}

export function getVenmoNativeScheme(charge: VenmoCharge): string {
  const encodedNote = encodeURIComponent(charge.note);
  const formattedAmount = charge.amount.toFixed(2);
  const txnType = charge.type || 'charge';

  return `venmo://paycharge?txn=${txnType}&recipients=${charge.recipientId}&amount=${formattedAmount}&note=${encodedNote}`;
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
