import { useEffect } from 'react';
import { App, AppState } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';

const TIMEOUT_KEY = 'session_timeout_background_timestamp';

interface UseSessionTimeoutProps {
  onTimeout: () => void;
  timeoutMinutes: number;
}

export function useSessionTimeout({ onTimeout, timeoutMinutes }: UseSessionTimeoutProps) {
  useEffect(() => {
    const handleAppStateChange = (state: AppState) => {
      if (!state.isActive) {
        // App is going to background
        localStorage.setItem(TIMEOUT_KEY, Date.now().toString());
      } else {
        // App is coming to foreground
        checkTimeout();
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        localStorage.setItem(TIMEOUT_KEY, Date.now().toString());
      } else if (document.visibilityState === 'visible') {
        checkTimeout();
      }
    };

    const checkTimeout = () => {
      const backgroundTimestamp = localStorage.getItem(TIMEOUT_KEY);
      if (backgroundTimestamp) {
        const elapsed = Date.now() - parseInt(backgroundTimestamp, 10);
        const timeoutMs = timeoutMinutes * 60 * 1000;

        if (elapsed > timeoutMs) {
          onTimeout();
        }
        localStorage.removeItem(TIMEOUT_KEY);
      }
    };

    // Register listeners
    let listenerHandle: any = null;
    if (Capacitor.isNativePlatform()) {
      App.addListener('appStateChange', handleAppStateChange).then(handle => {
        listenerHandle = handle;
      });
    } else {
      document.addEventListener('visibilitychange', handleVisibilityChange);
    }

    // Check on initial load as well, in case the tab was inactive
    checkTimeout();

    // Cleanup
    return () => {
      if (Capacitor.isNativePlatform() && listenerHandle) {
        listenerHandle.remove();
      } else {
        document.removeEventListener('visibilitychange', handleVisibilityChange);
      }
    };
  }, [onTimeout, timeoutMinutes]);
}
