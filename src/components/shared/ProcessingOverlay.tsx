import { Loader2 } from 'lucide-react';

interface ProcessingOverlayProps {
  /** Whether the operation is in flight. */
  open: boolean;
  /** What is happening, e.g. "Creating recurring bill...". */
  message: string;
  /** Optional secondary line for slower operations. */
  hint?: string;
}

/**
 * Full-screen blocking loader.
 *
 * Sits above the fixed wizard navigation (z-50), so it covers the page and
 * absorbs pointer events while a write is in flight.
 *
 * Scope, precisely: this blocks POINTER interaction and explains the wait. It
 * does not trap keyboard focus, so Tab can still reach controls behind it.
 * That is tolerable because the submit controls disable themselves while
 * saving (`nextDisabled`/`isLoading` on StepFooter and WizardNavigation), so
 * the double-submit path is already closed without relying on this overlay.
 */
export function ProcessingOverlay({ open, message, hint }: ProcessingOverlayProps) {
  if (!open) return null;

  return (
    <div
      data-testid="processing-overlay"
      className="fixed inset-0 z-[60] flex items-center justify-center bg-background/80 backdrop-blur-sm"
      role="status"
    >
      <div className="flex flex-col items-center gap-3 px-6 text-center">
        <Loader2 className="w-10 h-10 animate-spin text-primary" />
        <p className="text-base font-medium">{message}</p>
        {hint && <p className="text-sm text-muted-foreground">{hint}</p>}
      </div>
    </div>
  );
}
