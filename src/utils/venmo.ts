import { VenmoCharge } from '@/types';

export function getVenmoUniversalLink(charge: VenmoCharge): string {
  const encodedNote = encodeURIComponent(charge.note);
  const formattedAmount = charge.amount.toFixed(2);
  const txnType = charge.type || 'charge';

  // This is a Universal Link. 
  // On mobile devices with the app installed, iOS/Android will intercept it and open the Venmo app natively.
  // On mobile without the app (or desktop), it will fallback automatically to the Venmo web payment page seamlessly.
  return `https://account.venmo.com/pay?txn=${txnType}&recipients=${charge.recipientId}&amount=${formattedAmount}&note=${encodedNote}&audience=friends`;
}

export function openVenmoApp(charge: VenmoCharge): void {
  const universalLink = getVenmoUniversalLink(charge);

  const isMobileOS = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

  if (isMobileOS) {
    // On mobile, window.location.href is the most reliable way to trigger OS-level 
    // universal link interception without running into popup blockers.
    window.location.href = universalLink;
  } else {
    // On desktop, open in a new tab so the user doesn't lose their place in our app.
    // Desktop OS won't intercept this anyway.
    window.open(universalLink, '_blank');
  }
}

// Kept for backward compatibility if any other files import these,
// though they evaluate identically to the universal link functions now.
export const constructVenmoDeepLink = getVenmoUniversalLink;
export const getVenmoWebUrl = getVenmoUniversalLink;
export const isVenmoInstalled = () => /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
