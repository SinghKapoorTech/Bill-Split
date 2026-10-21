import { Sparkles } from 'lucide-react';

/**
 * The paid-plan counterpart of `ScanQuotaNotice`, in the same spot under the
 * uploader. A free user sees "X free scans left"; a paying user sees what they
 * paid for instead of an empty space.
 *
 * PRESENTATIONAL, like `ScanQuotaNotice`: the caller decides when to show it
 * from the same `useScanDisclosure` result, so the loading mute is applied in
 * one place.
 */
export function UnlimitedScansNote() {
  return (
    <div
      role="status"
      className="mx-auto flex w-full max-w-sm items-center justify-center gap-2 rounded-lg border border-[#E8B04B]/50 bg-gradient-to-r from-[#F2C94C]/20 via-primary/10 to-[#F2C94C]/20 px-3 py-2.5"
    >
      <Sparkles className="h-4 w-4 shrink-0 text-primary" aria-hidden />
      <p className="responsive-text-sm font-medium text-foreground">Unlimited AI scans included</p>
    </div>
  );
}
