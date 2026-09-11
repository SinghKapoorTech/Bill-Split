import type { DisclosureLevel } from '@/utils/quotaDisclosure';

interface Props {
  level: DisclosureLevel;
  text: string;
  className?: string;
}

/**
 * The permanent answer to "how many free AI scans do I have left this month",
 * shown on the AI scan tab.
 *
 * DELIBERATELY NOT A CHIP OR A TOAST. Both were tried and rejected by the
 * owner: a pill reads as a notification — something that arrived and will go
 * away — and a toast is gone before the user has decided anything. This is
 * standing status text, so it is typeset as status text and simply sits there.
 *
 * PRESENTATIONAL. It takes the already-decided `level` and `text` instead of
 * calling `useScanDisclosure` itself, so that every mute (Pro, the Remote
 * Config kill switch, and the window while entitlement is in flight) is applied
 * in exactly one place. `'hidden'` covers all three, which is why rendering
 * nothing for it is all three cases at once.
 */
export function ScanQuotaNotice({ level, text, className = '' }: Props) {
  if (level === 'hidden' || level === 'silent' || !text) return null;

  // Zero is the only band that changes colour. Above it the line is neutral
  // information — colouring "1 left" as a warning turns an allowance the user
  // is using normally into an alarm.
  const tone = level === 'wall' ? 'text-destructive' : 'text-muted-foreground';

  return <p className={`text-caption-responsive ${tone} ${className}`}>{text}</p>;
}
