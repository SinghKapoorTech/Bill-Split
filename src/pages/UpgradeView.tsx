import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, Check, Loader2, Sparkles } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ProCelebration } from '@/components/monetization/ProCelebration';
import { usePlatform } from '@/hooks/usePlatform';
import { useEntitlement } from '@/hooks/useEntitlement';
import { useToast } from '@/hooks/use-toast';
import { layout } from '@/lib/styles';
import { cn } from '@/lib/utils';
import {
  isPurchasingAvailable,
  loadPaywallPackages,
  purchasePlan,
  restoreProAccess,
} from '@/services/purchaseService';
import { buildPaywallPlans, ctaLabel, type PaywallPlan } from '@/utils/paywallPlans';
import { IOS_MANAGE_SUBSCRIPTIONS_URL } from '@/utils/storeLinks';

/**
 * The Pro paywall.
 *
 * Guideline 3.1.2 sets the required content and every item is a rejection if
 * missing: both plans with price AND duration, what the subscription unlocks,
 * a Restore purchases control, and links to Terms of Use and Privacy Policy.
 *
 * Three modes:
 *  - SELLING (native + a RevenueCat key for this platform, i.e. iOS today):
 *    live store prices via `priceString` (localised per storefront), Purchase
 *    and Restore wired.
 *  - CANNOT SELL on native (Android until its store products exist): the
 *    reference prices with an inert "Coming soon" — a button that takes a tap
 *    and does nothing would leave a user believing they had bought something.
 *  - WEB: a web build may not sell the subscription at all (Guideline 3.1.1).
 *
 * Purchase never grants access here. The webhook writes `entitlements/{uid}`
 * and `useEntitlement` picks it up; this screen only reports the store result.
 */

// Reference prices for builds that cannot sell (web/Android). Never rendered
// next to a live price — a hardcoded "$" is wrong in every non-US storefront.
const REFERENCE_PLANS: PaywallPlan[] = [
  { id: 'monthly', priceString: '$4.99', period: 'per month', trialLabel: null, savingsNote: null },
  { id: 'yearly', priceString: '$34.99', period: 'per year', trialLabel: null, savingsNote: 'Save 41%' },
];

const INCLUDED = ['Unlimited AI receipt scans', 'Unlimited active groups', 'Everything in Free'];

type LoadState = { status: 'loading' } | { status: 'error' } | { status: 'ready'; plans: PaywallPlan[] };

function PlanCard({
  plan,
  selected,
  onSelect,
}: {
  plan: PaywallPlan;
  selected?: boolean;
  onSelect?: () => void;
}) {
  const body = (
    <>
      <div className="flex items-baseline gap-2">
        <span className="text-2xl font-bold">{plan.priceString}</span>
        {plan.savingsNote && (
          <span className="text-[11px] font-medium rounded-full px-2 py-0.5 bg-primary/10 text-primary">
            {plan.savingsNote}
          </span>
        )}
      </div>
      {/* Duration must be adjacent to the price, not inferred from the
          plan's name — Guideline 3.1.2 is explicit about it. */}
      <span className="text-caption-responsive text-muted-foreground">{plan.period}</span>
      {plan.trialLabel && <span className="text-caption-responsive text-primary">{plan.trialLabel}</span>}
    </>
  );
  if (!onSelect) return <Card className="p-4 flex flex-col gap-1">{body}</Card>;
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={cn(
        'rounded-lg border bg-card p-4 flex flex-col gap-1 text-left transition-colors',
        selected ? 'border-primary ring-2 ring-primary/30' : 'border-border',
      )}
    >
      {body}
    </button>
  );
}

/** React Router stores the history index in `history.state.idx`; 0 = first entry. */
function canGoBack(): boolean {
  const idx = (window.history.state as { idx?: number } | null)?.idx;
  return typeof idx === 'number' && idx > 0;
}

export default function UpgradeView() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { isNative } = usePlatform();
  const { plan: currentPlan } = useEntitlement();
  const selling = isNative && isPurchasingAvailable();
  const alreadyPro = currentPlan === 'pro';

  const [load, setLoad] = useState<LoadState>({ status: 'loading' });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busy, setBusy] = useState<'purchase' | 'restore' | null>(null);
  // Set once the store confirms a purchase; the overlay stays until "Let's go".
  const [celebration, setCelebration] = useState<{ subtitle?: string } | null>(null);

  const fetchPlans = useCallback(async () => {
    setLoad({ status: 'loading' });
    try {
      const plans = buildPaywallPlans(await loadPaywallPackages());
      if (plans.length === 0) throw new Error('no plans');
      setLoad({ status: 'ready', plans });
      setSelectedId((prev) => prev ?? plans[0].id);
    } catch (error) {
      console.warn('paywall: could not load offerings', error);
      setLoad({ status: 'error' });
    }
  }, []);

  useEffect(() => {
    if (selling && !alreadyPro) void fetchPlans();
  }, [selling, alreadyPro, fetchPlans]);

  const selected = load.status === 'ready' ? load.plans.find((p) => p.id === selectedId) : undefined;

  const onPurchase = async () => {
    if (!selected) return;
    setBusy('purchase');
    try {
      const outcome = await purchasePlan(selected.id);
      if (outcome === 'purchased') {
        // Celebrate instead of leaving; "Let's go" navigates back. Pro itself is
        // granted by the webhook — this only reflects the store's confirmation.
        // Name what was bought (plan + price), not just "you're all set".
        setCelebration({
          subtitle: selected.trialLabel
            ? `Your ${selected.trialLabel} has started, then ${selected.priceString} ${selected.period}.`
            : `${selected.priceString} ${selected.period}. Renews automatically.`,
        });
      } else if (outcome === 'pending') {
        toast({
          title: 'Purchase pending',
          description: 'Pro turns on as soon as the App Store approves it.',
        });
      }
      // 'cancelled': the user closed the sheet on purpose — say nothing.
    } catch (error) {
      console.warn('paywall: purchase failed', error);
      toast({
        title: 'Purchase didn\u2019t go through',
        description: 'Please try again in a moment.',
        variant: 'destructive',
      });
    } finally {
      setBusy(null);
    }
  };

  const onRestore = async () => {
    setBusy('restore');
    try {
      const restored = await restoreProAccess();
      toast(
        restored
          ? // Not "active on this account": access is granted by the webhook, and a
            // restore onto a second Divit account arrives as a TRANSFER event the
            // server does not handle yet (chunk-4 Task 2b).
            { title: 'Subscription found', description: 'Divit Pro will switch on shortly.' }
          : {
              // Restore never moves a subscription between Divit accounts
              // (RevenueCat: "Keep with original App User ID").
              title: 'No active subscription found',
              description: 'If you subscribed while signed in to another Divit account, sign in to that one.',
            },
      );
    } catch (error) {
      console.warn('paywall: restore failed', error);
      toast({ title: 'Restore failed', description: 'Please try again in a moment.', variant: 'destructive' });
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <ProCelebration
        show={celebration !== null}
        perks={INCLUDED}
        subtitle={celebration?.subtitle}
        onDone={() => {
          setCelebration(null);
          // Opened cold from a divit://upgrade link there is nothing to go back
          // to, and the user would be left on the paywall they just paid on.
          if (canGoBack()) navigate(-1);
          else navigate('/dashboard', { replace: true });
        }}
      />
      <div className="h-full flex flex-col animate-fade-in max-w-2xl mx-auto overflow-y-auto scrollbar-hide">
        <div className="shrink-0 pt-5 mb-2 px-1">
          <Button variant="ghost" size="sm" className="mb-2 -ml-2" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back
          </Button>
          <h1 className={layout.screen.title}>
            <Sparkles className="inline h-6 w-6 mr-2 text-primary" />
            Divit Pro
          </h1>
          <p className={layout.screen.subtitle}>Scan as much as you like, split as many trips as you like.</p>
        </div>

        <div className="px-1 space-y-4 pb-8">
          <Card className="p-4">
            <ul className="space-y-2">
              {INCLUDED.map((item) => (
                <li key={item} className="flex items-start gap-2 responsive-text-sm">
                  <Check className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </Card>

          {selling && alreadyPro ? (
            <Card className="p-4 space-y-2 text-center">
              <p className="font-medium">You&rsquo;re on Divit Pro</p>
              <a
                href={IOS_MANAGE_SUBSCRIPTIONS_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="responsive-text-sm underline underline-offset-2"
              >
                Manage subscription
              </a>
            </Card>
          ) : selling ? (
            load.status === 'loading' ? (
              <div className="flex justify-center py-8 text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin" aria-label="Loading prices" />
              </div>
            ) : load.status === 'error' ? (
              <Card className="p-4 space-y-3 text-center">
                <p className="responsive-text-sm">Couldn&rsquo;t load prices from the App Store.</p>
                <Button variant="outline" size="sm" onClick={() => void fetchPlans()}>
                  Try again
                </Button>
              </Card>
            ) : (
              <>
                <div role="radiogroup" aria-label="Choose a plan" className="grid gap-3 sm:grid-cols-2">
                  {load.plans.map((plan) => (
                    <PlanCard
                      key={plan.id}
                      plan={plan}
                      selected={plan.id === selectedId}
                      onSelect={() => setSelectedId(plan.id)}
                    />
                  ))}
                </div>
                {selected && (
                  <div className="space-y-2">
                    <Button size="lg" className="w-full" disabled={busy !== null} onClick={() => void onPurchase()}>
                      {busy === 'purchase' && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                      {ctaLabel(selected)}
                    </Button>
                    {/* Auto-renewal disclosure (Guideline 3.1.2): the billed amount and
                        period, stated next to the button. */}
                    <p className="text-caption-responsive text-muted-foreground text-center">
                      {selected.trialLabel
                        ? `${selected.trialLabel}, then ${selected.priceString} ${selected.period}.`
                        : `${selected.priceString} ${selected.period}.`}{' '}
                      Renews automatically. Cancel anytime in Settings.
                    </p>
                  </div>
                )}
              </>
            )
          ) : (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                {REFERENCE_PLANS.map((plan) => (
                  <PlanCard key={plan.id} plan={plan} />
                ))}
              </div>
              {isNative ? (
                <Button size="lg" className="w-full" disabled>
                  Coming soon
                </Button>
              ) : (
                <p className="text-caption-responsive text-muted-foreground text-center">
                  Divit Pro is purchased in the iOS or Android app.
                </p>
              )}
            </>
          )}

          <div className="flex flex-col items-center gap-2 pt-2">
            <Button
              variant="ghost"
              size="sm"
              disabled={!selling || busy !== null}
              onClick={() => void onRestore()}
            >
              {busy === 'restore' && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Restore purchases
            </Button>
            {/*
              TERMS OF USE — Guideline 3.1.2 requires a functional one on a
              subscription screen, and Divit has no Terms page of its own.

              This deliberately does NOT point at divit-bill.com/terms. That URL
              returns HTTP 200 and looks fine to any status check, because the
              site is a client-routed SPA that serves the same shell for every
              path — but App.tsx has no /terms route, so it rendered the app's own
              404. Apple's standard EULA is the documented default for apps that
              do not supply custom terms, and it lives on a host we do not
              operate, so it cannot rot when our router changes.

              NOTE FOR PLAY: this is the APP STORE's licence. If Google Play
              review asks for terms covering the Android subscription, that needs
              its own answer — Apple's EULA does not cover it.

              Privacy points at the IN-APP route, which genuinely exists
              (App.tsx `/privacy` -> PrivacyPolicy).
            */}
            <p className="text-caption-responsive text-muted-foreground text-center">
              <a
                href="https://www.apple.com/legal/internet-services/itunes/dev/stdeula/"
                target="_blank"
                rel="noreferrer"
                className="underline underline-offset-2"
              >
                Terms of Use
              </a>
              {' · '}
              <Link to="/privacy" className="underline underline-offset-2">
                Privacy Policy
              </Link>
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
