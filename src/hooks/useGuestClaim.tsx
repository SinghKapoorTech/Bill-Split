import { useCallback } from 'react';
import { useToast } from '@/hooks/use-toast';
import { ToastAction } from '@/components/ui/toast';
import { PENDING_CLAIM_KEY, describeClaimFailure } from '@/utils/guestClaim';

export type ClaimResult = 'none' | 'claimed' | 'failed';

/**
 * Runs the guest claim a sign-up started (the shadow uid saved under
 * PENDING_CLAIM_KEY), and tells the user when it fails instead of swallowing
 * the error. A failed claim used to land the new user on the shared bill with
 * "We couldn't find your profile on this bill." and no explanation.
 *
 * - success           → pending id cleared
 * - permanent failure → pending id cleared (it can never succeed), error toast
 * - temporary failure → pending id kept, error toast with a Retry action
 */
export function useGuestClaim() {
  const { toast } = useToast();

  const runPendingClaim = useCallback(async (): Promise<ClaimResult> => {
    const pendingClaimId = localStorage.getItem(PENDING_CLAIM_KEY);
    if (!pendingClaimId) return 'none';

    try {
      const { billService } = await import('@/services/billService');
      await billService.claimShadowUser(pendingClaimId);
      localStorage.removeItem(PENDING_CLAIM_KEY);
      return 'claimed';
    } catch (error) {
      console.error('Error claiming shadow user:', error);
      const failure = describeClaimFailure(error);
      if (!failure.retryable) localStorage.removeItem(PENDING_CLAIM_KEY);

      toast({
        variant: 'destructive',
        title: failure.title,
        description: failure.description,
        ...(failure.retryable && {
          action: (
            <ToastAction
              altText="Retry linking your guest bills"
              onClick={async () => {
                if ((await runPendingClaim()) === 'claimed') {
                  toast({
                    title: 'Guest bills linked',
                    description: 'They now appear in your account.',
                  });
                }
              }}
            >
              Retry
            </ToastAction>
          ),
        }),
      });
      return 'failed';
    }
  }, [toast]);

  return { runPendingClaim };
}
