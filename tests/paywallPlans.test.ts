/**
 * paywallPlans — turns RevenueCat packages into the rows the paywall shows.
 *
 * Guideline 3.1.2: each plan must show its billed price AND duration, and a
 * free trial must be described accurately. Showing "14-day free trial" to
 * someone Apple will charge immediately is the classic way to get both a
 * rejection and chargebacks, so trial copy is gated on the intro being FREE
 * and on the user not being known-ineligible.
 */
import { describe, it, expect } from 'vitest';
import { buildPaywallPlans, ctaLabel, type PaywallPackageInput } from '@/utils/paywallPlans';

const annual = (over: Partial<PaywallPackageInput> = {}): PaywallPackageInput => ({
  id: '$rc_annual',
  packageType: 'ANNUAL',
  price: 34.99,
  priceString: '$34.99',
  intro: { price: 0, periodUnit: 'WEEK', periodNumberOfUnits: 2 },
  trialEligible: true,
  ...over,
});
const monthly = (over: Partial<PaywallPackageInput> = {}): PaywallPackageInput => ({
  id: '$rc_monthly',
  packageType: 'MONTHLY',
  price: 4.99,
  priceString: '$4.99',
  intro: null,
  trialEligible: null,
  ...over,
});

describe('buildPaywallPlans', () => {
  it('orders yearly first and pairs each price with its duration', () => {
    const plans = buildPaywallPlans([monthly(), annual()]);
    expect(plans.map((p) => [p.id, p.priceString, p.period])).toEqual([
      ['$rc_annual', '$34.99', 'per year'],
      ['$rc_monthly', '$4.99', 'per month'],
    ]);
  });

  it('uses the store priceString verbatim (localised currency), never a computed one', () => {
    const plans = buildPaywallPlans([annual({ priceString: '₹3,499.00', price: 3499 })]);
    expect(plans[0].priceString).toBe('₹3,499.00');
  });

  it('describes a free 2-WEEK intro as a 14-day free trial', () => {
    expect(buildPaywallPlans([annual()])[0].trialLabel).toBe('14-day free trial');
  });

  it('describes a free DAY-unit intro in days', () => {
    const plans = buildPaywallPlans([
      annual({ intro: { price: 0, periodUnit: 'DAY', periodNumberOfUnits: 3 } }),
    ]);
    expect(plans[0].trialLabel).toBe('3-day free trial');
  });

  it('hides the trial when the user is known INELIGIBLE (already used it)', () => {
    expect(buildPaywallPlans([annual({ trialEligible: false })])[0].trialLabel).toBeNull();
  });

  it('hides the trial when eligibility is UNKNOWN (RevenueCat: show the non-intro price)', () => {
    expect(buildPaywallPlans([annual({ trialEligible: null })])[0].trialLabel).toBeNull();
  });

  it('never calls a PAID intro offer a free trial', () => {
    const plans = buildPaywallPlans([
      annual({ intro: { price: 0.99, periodUnit: 'WEEK', periodNumberOfUnits: 2 } }),
    ]);
    expect(plans[0].trialLabel).toBeNull();
  });

  it('shows yearly savings against 12 × monthly, rounded down so it never overstates', () => {
    // 1 - 34.99 / 59.88 = 41.57% → "Save 41%", not 42%.
    const plans = buildPaywallPlans([annual(), monthly()]);
    expect(plans.find((p) => p.id === '$rc_annual')!.savingsNote).toBe('Save 41%');
    expect(plans.find((p) => p.id === '$rc_monthly')!.savingsNote).toBeNull();
  });

  it('shows no savings note without a monthly to compare against', () => {
    expect(buildPaywallPlans([annual()])[0].savingsNote).toBeNull();
  });

  it('drops package types the paywall does not sell', () => {
    const plans = buildPaywallPlans([
      annual(),
      { ...monthly(), id: '$rc_weekly', packageType: 'WEEKLY' },
    ]);
    expect(plans.map((p) => p.id)).toEqual(['$rc_annual']);
  });
});

describe('ctaLabel', () => {
  it('says "Start 14-day free trial" for a plan with a trial', () => {
    const [plan] = buildPaywallPlans([annual()]);
    expect(ctaLabel(plan)).toBe('Start 14-day free trial');
  });

  it('says "Subscribe" when there is no trial', () => {
    const [plan] = buildPaywallPlans([monthly()]);
    expect(ctaLabel(plan)).toBe('Subscribe');
  });
});
