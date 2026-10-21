import { useEntitlement } from '@/hooks/useEntitlement';
import { usePlatform } from '@/hooks/usePlatform';
import { proStatus, type ProStatus } from '@/utils/proStatus';

/**
 * The signed-in user's paid plan as `proStatus` describes it, or `null` while
 * loading and for free users. Ignores the paywall kill switch on purpose — see
 * `src/utils/proStatus.ts`.
 */
export function useProStatus(): ProStatus | null {
  const { plan, expiresAt, loading } = useEntitlement();
  const { platform } = usePlatform();
  return proStatus({ loading, plan, expiresAtMs: expiresAt, platform, nowMs: Date.now() });
}
