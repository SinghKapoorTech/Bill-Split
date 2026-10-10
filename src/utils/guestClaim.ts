/**
 * Guest-claim helpers shared by the web and native sign-in pages.
 *
 * Pure: no Firebase imports, so it unit-tests without a Firebase config.
 */

/** localStorage key holding the shadow uid a guest asked to claim at sign-up. */
export const PENDING_CLAIM_KEY = 'pending_claim_guest_id';

export interface ClaimFailure {
  /** True when trying again later could succeed (network, server hiccup). */
  retryable: boolean;
  title: string;
  description: string;
}

/**
 * Errors that mean this claim can NEVER succeed. Keeping the pending id after
 * one of these would retry silently on every sign-in forever.
 */
const PERMANENT_CODES = new Set([
  'functions/not-found', // already claimed (the shadow doc is deleted) or a bogus id
  'functions/permission-denied', // not a guest account, or a deleted one
  'functions/invalid-argument',
  'functions/failed-precondition',
]);

export function describeClaimFailure(error: unknown): ClaimFailure {
  const code = (error as { code?: unknown } | null)?.code;

  if (typeof code === 'string' && PERMANENT_CODES.has(code)) {
    return {
      retryable: false,
      title: "Couldn't link your guest bills",
      description:
        code === 'functions/not-found'
          ? 'That guest profile was already linked to an account or no longer exists.'
          : "That guest profile can't be linked to your account.",
    };
  }

  return {
    retryable: true,
    title: "Couldn't link your guest bills",
    description: 'Your account is ready, but linking your bills as a guest failed. Try again.',
  };
}
