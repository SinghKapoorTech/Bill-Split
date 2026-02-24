import { VenmoCharge } from '@/types';
import { Capacitor } from '@capacitor/core';

export function constructVenmoDeepLink(charge: VenmoCharge): string {
  const encodedNote = encodeURIComponent(charge.note);
  const formattedAmount = charge.amount.toFixed(2);
  const txnType = charge.type || 'charge';

  return `venmo://paycharge?txn=${txnType}&recipients=${charge.recipientId}&amount=${formattedAmount}&note=${encodedNote}`;
}

export function openVenmoApp(charge: VenmoCharge): void {
  // Use user-agent check so that BOTH the native Capacitor app AND 
  // regular mobile browser users (Safari/Chrome on phone) get the native deep link
  const isMobileOS = isVenmoInstalled();

  if (isMobileOS) {
    // Native Mobile OS: Use strict deep link
    const deepLink = constructVenmoDeepLink(charge);
    window.location.href = deepLink;
  } else {
    // Desktop Browser: Use universal web link
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

  const url = `https://account.venmo.com/pay?txn=${txnType}&recipients=${charge.recipientId}&amount=${formattedAmount}&note=${encodedNote}&audience=friends`;

  return url;
}
