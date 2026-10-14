import { describe, it, expect } from 'vitest';
import { planCardModel, type PlanCardInput } from '@/utils/planCard';

const NOW = Date.UTC(2026, 9, 13, 12);
const NOV_1 = Date.UTC(2026, 10, 1);

const base: PlanCardInput = {
  loading: false,
  paywallEnabled: true,
  plan: 'free',
  scansUsed: 1,
  scanLimit: 2,
  scanResetsAtMs: NOV_1,
  groupsActive: 2,
  groupLimit: 2,
  nowMs: NOW,
};

describe('planCardModel — when the card is shown at all', () => {
  it('is hidden while anything is loading (no "Free" flash for a subscriber)', () => {
    expect(planCardModel({ ...base, loading: true, plan: 'pro' })).toBeNull();
  });

  it('is hidden while the paywall kill switch is dark', () => {
    expect(planCardModel({ ...base, paywallEnabled: false })).toBeNull();
  });

  it('is shown once settled with the paywall on', () => {
    // The positive case pins the two nulls above: an over-strict model that
    // always returned null would fail here.
    expect(planCardModel(base)?.planLabel).toBe('Free');
  });
});

describe('planCardModel — free plan', () => {
  it('states scans used against the live limit, with the UTC reset date', () => {
    const m = planCardModel({ ...base, scansUsed: 3, scanLimit: 5 })!;
    expect(m.scansLine).toBe('3 of 5 free AI scans used · resets Nov 1');
  });

  it('states active groups against the live limit', () => {
    expect(planCardModel({ ...base, groupsActive: 1, groupLimit: 4 })!.groupsLine).toBe(
      '1 of 4 groups active',
    );
  });

  it('clamps a count above a tightened limit ("3 of 2" reads as a bug)', () => {
    const m = planCardModel({ ...base, scansUsed: 4, groupsActive: 3 })!;
    expect(m.scansLine).toBe('2 of 2 free AI scans used · resets Nov 1');
    expect(m.groupsLine).toBe('2 of 2 groups active');
  });

  it('singular group noun at a limit of 1', () => {
    expect(planCardModel({ ...base, groupsActive: 0, groupLimit: 1 })!.groupsLine).toBe(
      '0 of 1 group active',
    );
  });

  it('never renders NaN or a 1970 date from unusable inputs', () => {
    const m = planCardModel({
      ...base,
      scansUsed: NaN,
      scanLimit: 2,
      scanResetsAtMs: 0,
      groupsActive: 1,
      groupLimit: Infinity,
    })!;
    expect(m.scansLine).toBe('Free AI scans each month');
    expect(m.groupsLine).toBe('Limited active groups');
  });

  it('drops the reset clause rather than naming a wrong date', () => {
    expect(planCardModel({ ...base, scanResetsAtMs: 0 })!.scansLine).toBe(
      '1 of 2 free AI scans used',
    );
  });

  it('offers the upgrade, and has no renewal detail', () => {
    const m = planCardModel(base)!;
    expect(m.showUpgrade).toBe(true);
    expect(m.planDetail).toBeNull();
  });
});

describe('planCardModel — paid plans', () => {
  const inAYear = Date.UTC(2027, 9, 13, 12);

  it('Pro: unlimited, renewal date with year, no upgrade offer', () => {
    const m = planCardModel({ ...base, plan: 'pro', expiresAtMs: inAYear })!;
    expect(m).toEqual({
      planLabel: 'Pro',
      planDetail: 'until Oct 13, 2027',
      scansLine: 'Unlimited AI scans',
      groupsLine: 'Unlimited active groups',
      showUpgrade: false,
    });
  });

  it('Pro in its billing grace period (date in the past) claims no renewal date', () => {
    const m = planCardModel({ ...base, plan: 'pro', expiresAtMs: NOW - 1 })!;
    expect(m.planLabel).toBe('Pro');
    expect(m.planDetail).toBeNull();
  });

  it('Trip Pass says when it ends', () => {
    const m = planCardModel({ ...base, plan: 'trip_pass', expiresAtMs: inAYear })!;
    expect(m.planLabel).toBe('Trip Pass');
    expect(m.planDetail).toBe('ends Oct 13, 2027');
    expect(m.showUpgrade).toBe(false);
  });
});
