import { Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { usePlatform } from '@/hooks/usePlatform';
import type { DisclosureLevel } from '@/utils/quotaDisclosure';

interface Props {
  level: DisclosureLevel;
  text: string;
  /**
   * Opens the upgrade path. Shown ONLY at zero (owner, 2026-10-13); above it
   * the line stays purely factual. Optional: omit it and no button renders.
   */
  onSeePro?: () => void;
  className?: string;
}

/**
 * Glues the reset clause together ("resets Nov 1") with no-break spaces so a
 * narrow phone wraps BEFORE it, never as "resets Nov" / "1". The words are
 * unchanged — only the spaces inside the clause become U+00A0.
 */
function keepResetTogether(text: string): string {
  return text.replace(/resets (\S+) (\S+)$/, 'resets\u00a0$1\u00a0$2');
}


/**
 * The permanent answer to "how many free AI scans do I have left this month",
 * shown on the AI scan tab.
 *
 * DELIBERATELY NOT A CHIP OR A TOAST. Both were tried and rejected by the
 * owner: a pill reads as a notification — something that arrived and will go
 * away — and a toast is gone before the user has decided anything. This is
 * standing status, so it is a quiet full-width status block that simply sits
 * there.
 *
 * MADE TO STAND OUT (owner, 2026-10-13: the plain caption "didn't really stand
 * out"; then "just the amount of free scans and when it resets"): a light
 * bordered block, full-strength text, nothing else. At ZERO it turns red and
 * carries the upgrade button (owner, 2026-10-13); above zero it is factual, never an
 * upsell (AI-sim learnings, master plan §2b: casual users are meant to stay
 * free); the out-of-scans modal handles the moment a user is actually blocked.
 *
 * PRESENTATIONAL. It takes the already-decided `level` and `text` instead of
 * calling `useScanDisclosure` itself, so that every mute (Pro, the Remote
 * Config kill switch, and the window while entitlement is in flight) is applied
 * in exactly one place. `'hidden'` covers all three, which is why rendering
 * nothing for it is all three cases at once.
 */
export function ScanQuotaNotice({ level, text, onSeePro, className = '' }: Props) {
  const { isNative } = usePlatform();

  if (level === 'hidden' || level === 'silent' || !text) return null;

  // Zero is the only band that changes colour. Above it the line is neutral
  // information — colouring "1 left" as a warning turns an allowance the user
  // is using normally into an alarm.
  const atZero = level === 'wall';
  const tone = atZero ? 'text-destructive' : 'text-muted-foreground';
  const frame = atZero
    ? 'border-destructive/40 bg-destructive/5'
    : 'border-primary/25 bg-primary/5';

  return (
    <div
      className={`w-full max-w-sm mx-auto rounded-lg border px-3 py-2.5 text-center space-y-2 ${frame} ${tone} ${className}`}
      role="status"
    >
      {/* ONE text node on purpose: the sentence is the contract (screen
          readers and the uploader tests read it whole), so it is emphasised
          as a unit rather than split around the number. */}
      <p
        className={`responsive-text-sm font-medium text-balance ${atZero ? '' : 'text-foreground'}`}
      >
        {keepResetTogether(text)}
      </p>
      {atZero && onSeePro && (
        <Button size="sm" onClick={onSeePro}>
          <Sparkles className="mr-2 h-4 w-4" />
          {/* A web build cannot sell the subscription (Guideline 3.1.1) —
              same wording as ScanQuotaWall. */}
          {isNative ? 'Upgrade to Pro' : 'Get Pro in the app'}
        </Button>
      )}
    </div>
  );
}
