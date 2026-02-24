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
    // Universal Links (https://...) are great, but programmatic triggers 
    // (window.location.href) often fail to launch the app on iOS Safari due to security/UX rules.
    // 
    // The most robust solution for mobile web browsers is the "Hybrid Hacker" approach:
    // 1. Try to fiercely force the app open via the custom scheme.
    // 2. If it fails, the browser will likely swallow the error or show a brief alert, 
    //    but we catch them with a timeout and redirect them to the universal web link.
    
    window.location.href = nativeScheme;

    setTimeout(() => {
      // If the app opened natively, the browser is usually put in the background.
      // If it's still visible, the app wasn't installed (or it failed), so fall back to web.
      if (document.visibilityState !== 'hidden') {
        window.location.href = universalLink;
      }
    }, 2500);
  } else {
    // On desktop, simply open the web link in a new tab.
    window.open(universalLink, '_blank');
  }
}

// Kept for backward compatibility
export const constructVenmoDeepLink = getVenmoNativeScheme;
export const getVenmoWebUrl = getVenmoUniversalLink;
export const isVenmoInstalled = () => /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
