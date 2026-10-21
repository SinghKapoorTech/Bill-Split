import { Check, ExternalLink, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useProStatus } from '@/hooks/useProStatus';
import { PRO_PERKS } from '@/utils/proPerks';
import { ProBadge } from '@/components/monetization/ProBadge';

/**
 * Top of Settings → Profile for a PAYING user, in the slot where a free user
 * sees `UpgradeCta`. The two never show together: the CTA is free-only and
 * this is paid-only.
 *
 * "Manage subscription" opens the store's own subscription page — that is
 * where Apple and Google let a user cancel, and the app cannot do it itself.
 */
export function ProMembershipCard() {
  const status = useProStatus();
  if (!status) return null;

  return (
    <section
      aria-label={status.title}
      className="relative overflow-hidden rounded-2xl border border-[#E8B04B]/50 bg-gradient-to-br from-[#F2C94C]/25 via-primary/10 to-transparent p-4"
    >
      <div
        aria-hidden
        className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full bg-[#F2C94C]/30 blur-2xl"
      />
      <div className="relative flex items-center gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#F2C94C] to-[#C9822B] shadow-[0_0_20px_hsl(var(--primary-glow)/0.45)]">
          <Sparkles className="h-5 w-5 text-[#2A2116]" strokeWidth={2.2} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-bold text-foreground">{status.title}</h2>
            <ProBadge label="Member" />
          </div>
          {status.detail && <p className="text-xs text-muted-foreground">{status.detail}</p>}
        </div>
      </div>

      <ul className="relative mt-3 space-y-1.5">
        {PRO_PERKS.map((perk) => (
          <li key={perk} className="flex items-center gap-2 text-sm text-foreground">
            <Check className="h-4 w-4 shrink-0 text-primary" />
            {perk}
          </li>
        ))}
      </ul>

      {status.manageUrl && (
        <Button
          variant="outline"
          size="sm"
          className="relative mt-4 w-full border-[#E8B04B]/50 bg-background/60"
          onClick={() => window.open(status.manageUrl!, '_blank')}
        >
          Manage subscription
          <ExternalLink className="ml-2 h-3.5 w-3.5" />
        </Button>
      )}
    </section>
  );
}
