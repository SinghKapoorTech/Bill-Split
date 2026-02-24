import { VenmoCharge } from '@/types';
import { Capacitor } from '@capacitor/core';

export function constructVenmoDeepLink(charge: VenmoCharge): string {
  const encodedNote = encodeURIComponent(charge.note);
  const formattedAmount = charge.amount.toFixed(2);
  const txnType = charge.type || 'charge';

  return `venmo://paycharge?txn=${txnType}&recipients=${charge.recipientId}&amount=${formattedAmount}&note=${encodedNote}`;
}

export function openVenmoApp(charge: VenmoCharge): void {
  const isNative = Capacitor.isNativePlatform();

  if (isNative) {
    // Native App: Use strict deep link
    const deepLink = constructVenmoDeepLink(charge);
    window.open(deepLink, '_system');
  } else {
    // Web Browser: Use universal web link (Venmo's site handles redirecting to the app if installed)
    const webLink = getVenmoWebUrl(charge);
    window.open(webLink, '_blank');
  }
}

export function isVenmoInstalled(): boolean {
  return /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
}

export function getVenmoWebUrl(charge: VenmoCharge): string {
  const encodedNote = encodeURIComponent(charge.note);
  const formattedAmount = charge.amount.toFixed(2);
  const txnType = charge.type || 'charge';

  return `https://account.venmo.com/pay?txn=${txnType}&amount=${formattedAmount}&note=${encodedNote}&audience=friends`;
}
