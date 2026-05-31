import { ChevronLeft } from 'lucide-react';

/** A small "Change type" affordance shown above the stepper in each sub-wizard. */
export function ChangeTypeButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="mb-2 inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
    >
      <ChevronLeft className="w-3.5 h-3.5" />
      Change type
    </button>
  );
}
