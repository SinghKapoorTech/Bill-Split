/**
 * Pure mapping from RevenueCat packages to paywall rows. Kept free of the SDK
 * types so it is unit-testable without a device.
 *
 * Guideline 3.1.2 rules encoded here:
 *  - the billed price is the store's `priceString` verbatim (localised
 *    currency), always paired with its duration;
 *  - "free trial" copy appears only for a FREE intro offer the store confirms
 *    this user is eligible for.
 */

export interface PaywallPackageInput {
  id: string;
  /** RevenueCat PACKAGE_TYPE, e.g. 'ANNUAL' | 'MONTHLY'. */
  packageType: string;
  price: number;
  priceString: string;
  intro: { price: number; periodUnit: string; periodNumberOfUnits: number } | null;
  /** true = eligible, false = known ineligible, null = unknown. */
  trialEligible: boolean | null;
}

export interface PaywallPlan {
  id: string;
  priceString: string;
  period: 'per year' | 'per month';
  trialLabel: string | null;
  savingsNote: string | null;
}

const SOLD: Record<string, PaywallPlan['period']> = {
  ANNUAL: 'per year',
  MONTHLY: 'per month',
};

const DAYS_PER_UNIT: Record<string, number> = { DAY: 1, WEEK: 7 };

function trialLabel(pkg: PaywallPackageInput): string | null {
  const intro = pkg.intro;
  // Only when the store CONFIRMS eligibility. RevenueCat's guidance for an
  // unknown status is to show the regular price, and claiming a trial Apple
  // then charges for is a rejection and a chargeback.
  if (!intro || intro.price !== 0 || pkg.trialEligible !== true) return null;
  const perUnit = DAYS_PER_UNIT[intro.periodUnit];
  if (perUnit) return `${intro.periodNumberOfUnits * perUnit}-day free trial`;
  if (intro.periodUnit === 'MONTH') return `${intro.periodNumberOfUnits}-month free trial`;
  return 'Free trial';
}

export function buildPaywallPlans(packages: PaywallPackageInput[]): PaywallPlan[] {
  const sold = packages.filter((p) => SOLD[p.packageType]);
  const monthly = sold.find((p) => p.packageType === 'MONTHLY');

  return sold
    .sort((a, b) => (a.packageType === 'ANNUAL' ? -1 : b.packageType === 'ANNUAL' ? 1 : 0))
    .map((p) => {
      let savingsNote: string | null = null;
      if (p.packageType === 'ANNUAL' && monthly && monthly.price > 0) {
        // Floor, so the claim can never overstate the real saving.
        const pct = Math.floor((1 - p.price / (monthly.price * 12)) * 100);
        if (pct > 0) savingsNote = `Save ${pct}%`;
      }
      return {
        id: p.id,
        priceString: p.priceString,
        period: SOLD[p.packageType],
        trialLabel: trialLabel(p),
        savingsNote,
      };
    });
}

export function ctaLabel(plan: PaywallPlan): string {
  return plan.trialLabel ? `Start ${plan.trialLabel}` : 'Subscribe';
}
