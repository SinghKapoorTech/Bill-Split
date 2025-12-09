import { useEffect } from 'react';
import { App as CapApp } from '@capacitor/app';
import { usePlatform } from './usePlatform';

/**
 * Handle deep links (Venmo URLs) on mobile
 * Listens for app URL open events on native platforms
 */
export function useDeepLinks() {
  const { isNative } = usePlatform();

  useEffect(() => {
    if (!isNative) return;

    const handleAppUrlOpen = CapApp.addListener('appUrlOpen', (data) => {
      // Handle Venmo callback if needed
      // Example: venmo://... redirects back to your app
      // You can parse data.url and navigate accordingly
    });

    return () => {
      handleAppUrlOpen.remove();
    };
  }, [isNative]);
}
