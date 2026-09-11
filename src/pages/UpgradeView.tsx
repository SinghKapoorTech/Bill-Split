import { ArrowLeft, Check, Sparkles } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { usePlatform } from '@/hooks/usePlatform';
import { layout } from '@/lib/styles';

/**
 * The Pro paywall.
 *
 * STATIC IN THIS PHASE. Nothing here can take money yet — the RevenueCat SDK
 * arrives in Phase 4, and the Apple Paid Applications agreement and Play
 * payments profile are still pending. The screen exists now because the
 * out-of-scans modal needs somewhere to send people, and a modal whose only
 * button 404s is worse than no button.
 *
 * Guideline 3.1.2 sets the required content and every item is a rejection if
 * missing: both plans with price AND duration, what the subscription unlocks,
 * a Restore purchases control, and links to Terms of Use and Privacy Policy.
 * They are all here and all inert, which is the honest state — a purchase
 * button that takes a tap and does nothing would leave a user believing they
 * had bought something.
 */

// TODO(phase4): replace with real `Offerings` from the RevenueCat SDK. These
// are placeholders — `product.priceString` is the only price that may ship,
// because the store localises currency per storefront and a hardcoded "$" is
// wrong in every non-US market.
const PLANS = [
  { id: 'monthly', price: '$4.99', period: 'per month', note: null },
  { id: 'yearly', price: '$34.99', period: 'per year', note: 'Save 42%' },
] as const;

const INCLUDED = ['Unlimited AI receipt scans', 'Unlimited active groups', 'Everything in Free'];

export default function UpgradeView() {
  const navigate = useNavigate();
  const { isNative } = usePlatform();

  return (
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

        <div className="grid gap-3 sm:grid-cols-2">
          {PLANS.map((plan) => (
            <Card key={plan.id} className="p-4 flex flex-col gap-1">
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-bold">{plan.price}</span>
                {plan.note && (
                  <span className="text-[11px] font-medium rounded-full px-2 py-0.5 bg-primary/10 text-primary">
                    {plan.note}
                  </span>
                )}
              </div>
              {/* Duration must be adjacent to the price, not inferred from the
                  plan's name — Guideline 3.1.2 is explicit about it. */}
              <span className="text-caption-responsive text-muted-foreground">{plan.period}</span>
            </Card>
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

        <div className="flex flex-col items-center gap-2 pt-2">
          <Button variant="ghost" size="sm" disabled>
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
  );
}
