import { VenmoCharge } from '@/types';

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
      const timeElapsed = Date.now() - startTime;
      
      // If the app successfully opened, the browser was likely suspended/backgrounded.
      // In that case, the setTimeout will be delayed significantly more than 2500ms when they return.
      // If it fired right on time (~2500ms), the app didn't open and the user is still staring at the browser.
      // We add a 500ms buffer to account for normal browser execution delays.
      
      if (timeElapsed < 3000 && document.visibilityState !== 'hidden') {
         window.location.href = universalLink;
      }
    }, 2500);
  } else {
    window.open(universalLink, '_blank');
  }
}

// Kept for backward compatibility
export const constructVenmoDeepLink = getVenmoNativeScheme;
export const getVenmoWebUrl = getVenmoUniversalLink;
export const isVenmoInstalled = () => /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
