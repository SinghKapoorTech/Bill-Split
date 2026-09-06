/**
 * Development-only logging.
 *
 * Use this instead of console.log for any diagnostic that touches user data.
 * Production console output is visible to anyone who opens devtools — including,
 * on the guest claim screen, people who are not users of this app at all.
 *
 * `createDebugLog` takes the flag explicitly so it is unit-testable without
 * stubbing import.meta.env.
 */
export function createDebugLog(enabled: boolean) {
  return (...args: unknown[]): void => {
    if (!enabled) return;
    console.log(...args);
  };
}

// `?? false` is fail-closed on purpose: if import.meta.env is ever absent (a
// non-Vite consumer, an SSR pass, a test runner without the Vite transform),
// the correct behaviour for a privacy control is to log NOTHING, not to log
// everything.
export const debugLog = createDebugLog(import.meta.env?.DEV ?? false);
