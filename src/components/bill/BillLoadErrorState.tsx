import { FileX, Loader2, WifiOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { BillLoadFailure, billLoadErrorVariant } from '@/utils/billLoadResult';

interface BillLoadErrorStateProps {
  failure: BillLoadFailure;
  onRetry: () => void;
  onBack: () => void;
  /** Where Go back leads (useReturnTo label, e.g. "Event"); shown on the button. */
  backLabel?: string;
  isRetrying?: boolean;
}

const COPY = {
  offline: {
    Icon: WifiOff,
    heading: "You're offline",
    sub: 'Check your connection and try again.',
  },
  unavailable: {
    Icon: FileX,
    heading: "Couldn't open this bill",
    sub: "It may have been deleted, or you don't have access.",
  },
} as const;

/**
 * Full-page state for a bill URL that failed to load. Offline: retrying is the
 * likely fix, so Try again leads. Deleted/no access: retrying won't help, so
 * Go back leads.
 */
export function BillLoadErrorState({ failure, onRetry, onBack, backLabel, isRetrying = false }: BillLoadErrorStateProps) {
  const variant = billLoadErrorVariant(failure);
  const { Icon, heading, sub } = COPY[variant];
  const retryFirst = variant === 'offline';

  const retryButton = (
    <Button
      key="retry"
      variant={retryFirst ? 'default' : 'outline'}
      onClick={onRetry}
      disabled={isRetrying}
      className="w-full sm:w-auto"
    >
      {isRetrying && <Loader2 className="animate-spin" aria-hidden="true" />}
      Try again
    </Button>
  );
  const backButton = (
    <Button
      key="back"
      variant={retryFirst ? 'outline' : 'default'}
      onClick={onBack}
      aria-label={backLabel ? `Go back to ${backLabel}` : undefined}
      className="w-full sm:w-auto"
    >
      {backLabel ? `Back to ${backLabel}` : 'Go back'}
    </Button>
  );

  return (
    <div className="flex min-h-[60vh] w-full items-center justify-center px-4 py-12">
      <div className="flex w-full max-w-sm flex-col items-center text-center" role="alert">
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-muted">
          <Icon className="h-7 w-7 text-muted-foreground" aria-hidden="true" />
        </div>
        <h2 className="text-xl font-semibold text-foreground">{heading}</h2>
        <p className="mt-2 text-sm text-muted-foreground">{sub}</p>
        <div className="mt-6 flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:justify-center">
          {retryFirst ? [retryButton, backButton] : [backButton, retryButton]}
        </div>
      </div>
    </div>
  );
}
