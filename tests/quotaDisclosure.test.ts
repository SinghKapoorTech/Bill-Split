import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { scanDisclosure, groupDisclosure, type DisclosureLevel } from '@/utils/quotaDisclosure';

/**
 * The reset date is the whole reason these tests pin a timezone.
 *
 * `resetsAtMs` is a UTC month boundary, and the server's prose message is
 * formatted UTC-side ("resets on October 1"). A client that formats the same
 * instant in LOCAL time renders "Sep 30" in any zone behind UTC and contradicts
 * the sentence next to it.
 *
 * CI almost certainly runs UTC, where local and UTC rendering agree and the bug
 * is invisible. So we force a zone BEHIND UTC for this file: now the two
 * renderings differ by a day everywhere, and dropping `timeZone: 'UTC'` from
 * the implementation turns these tests red on every machine rather than only on
 * a developer laptop. Node >= 16 honours a runtime change to `process.env.TZ`.
 */
const ORIGINAL_TZ = process.env.TZ;
beforeAll(() => {
  process.env.TZ = 'America/New_York';
});
afterAll(() => {
  // `process.env.TZ = undefined` assigns the STRING "undefined", which resolves
  // to no timezone at all. Vitest isolates per file so nothing leaks today, but
  // restoring a value that was never set has to be a delete.
  if (ORIGINAL_TZ === undefined) delete process.env.TZ;
  else process.env.TZ = ORIGINAL_TZ;
});

/** 2026-10-01T00:00:00Z — "Oct 1" in UTC, but "Sep 30" in any zone behind it. */
const OCT_START = Date.UTC(2026, 9, 1);
const LIMIT = 2;

const base = {
  remaining: LIMIT,
  limit: LIMIT,
  resetsAtMs: OCT_START,
  unlimited: false,
  paywallEnabled: true,
};

describe('scanDisclosure — the ladder', () => {
  // The plan's table: remaining in {2,1,0} x unlimited x paywallEnabled.
  // Only the bottom-left cell (free user, paywall on) shows anything at all.
  const table: Array<{
    remaining: number;
    unlimited: boolean;
    paywallEnabled: boolean;
    level: DisclosureLevel;
  }> = [
    { remaining: 2, unlimited: false, paywallEnabled: true, level: 'ambient' },
    { remaining: 1, unlimited: false, paywallEnabled: true, level: 'last' },
    { remaining: 0, unlimited: false, paywallEnabled: true, level: 'wall' },

    // A Pro subscriber is never shown a count, at any remaining value.
    { remaining: 2, unlimited: true, paywallEnabled: true, level: 'hidden' },
    { remaining: 1, unlimited: true, paywallEnabled: true, level: 'hidden' },
    { remaining: 0, unlimited: true, paywallEnabled: true, level: 'hidden' },

    // Enforcement dark: the server still counts, but nothing may be shown.
    { remaining: 2, unlimited: false, paywallEnabled: false, level: 'hidden' },
    { remaining: 1, unlimited: false, paywallEnabled: false, level: 'hidden' },
    { remaining: 0, unlimited: false, paywallEnabled: false, level: 'hidden' },

    { remaining: 0, unlimited: true, paywallEnabled: false, level: 'hidden' },
  ];

  for (const row of table) {
    const who = row.unlimited ? 'pro' : 'free';
    const gate = row.paywallEnabled ? 'paywall on' : 'paywall off';
    it(`${who}, ${gate}, ${row.remaining} left -> ${row.level}`, () => {
      expect(scanDisclosure({ ...base, ...row }).level).toBe(row.level);
    });
  }

  it('shows nothing at all when hidden — an empty string, not stale copy', () => {
    expect(scanDisclosure({ ...base, unlimited: true }).text).toBe('');
    expect(scanDisclosure({ ...base, paywallEnabled: false }).text).toBe('');
  });
});

describe('scanDisclosure — the reset date travels with the count', () => {
  // "Always show the reset date alongside the count" (spec 4.3.1). A count with
  // no date reads as a permanent loss rather than a monthly allowance.
  for (const remaining of [2, 1, 0]) {
    it(`states the reset date at ${remaining} remaining`, () => {
      expect(scanDisclosure({ ...base, remaining }).text).toContain('Oct 1');
    });
  }

  it('formats the boundary in UTC, not the local zone', () => {
    // Under TZ=America/New_York the same instant is Sep 30 locally. If the
    // implementation drops `timeZone: 'UTC'` this reads "Sep 30" and the client
    // contradicts the server message sitting beside it.
    const text = scanDisclosure({ ...base, remaining: 0 }).text;
    expect(text).toContain('Oct 1');
    expect(text).not.toContain('Sep 30');
  });

  // WEAK-ASSERTION GUARD. The previous version of this test asserted
  // `toContain('2')` while `base.limit` was also 2 — so hardcoding the limit in
  // the copy left all 24 tests green. `free_scans_per_month` is a live Remote
  // Config key, and this is the only place it is rendered. Assert the whole
  // string, at a limit that is NOT the launch default.
  it('renders the configured limit at the wall, not a hardcoded one', () => {
    expect(scanDisclosure({ ...base, remaining: 0, limit: 5 }).text).toBe(
      "You've used your 5 free scans this month · resets Oct 1",
    );
  });

  it('renders the configured limit in the ambient band', () => {
    expect(scanDisclosure({ ...base, remaining: 4, limit: 5 }).text).toBe(
      '4 scans left this month · resets Oct 1',
    );
  });

  // resolveLimit permits LIMIT_MIN = 1, so `free_scans_per_month: 1` is a
  // publishable value. "You've used your 1 free scans" would ship to every free
  // user on one console edit.
  it('says "scan", not "scans", when the limit is 1', () => {
    expect(scanDisclosure({ ...base, remaining: 0, limit: 1 }).text).toBe(
      "You've used your 1 free scan this month · resets Oct 1",
    );
  });

  it('does not claim a plural last scan', () => {
    const text = scanDisclosure({ ...base, remaining: 1 }).text;
    expect(text).toContain('Last free scan');
    expect(text).not.toContain('scans left');
  });
});

describe('scanDisclosure — defensive inputs', () => {
  // evaluateScanQuota already clamps remaining at zero, but this function is
  // also fed by the cap-error payload, which crosses a process boundary.
  it('treats a negative remainder as the wall, never as "ambient"', () => {
    expect(scanDisclosure({ ...base, remaining: -1 }).level).toBe('wall');
  });

  it('stays ambient above the launch limit if Remote Config raises it', () => {
    // free_scans_per_month is Remote Config driven; a limit of 5 must not fall
    // through to some unhandled band.
    const d = scanDisclosure({ ...base, remaining: 5, limit: 5 });
    expect(d.level).toBe('ambient');
    expect(d.text).toContain('5 scans left');
  });

  // Every one of these rendered literal "NaN"/"Invalid Date"/"Jan 1" (1970) to
  // the user before the guards existed. The direction is fixed by
  // shared/monetizationLimits.ts: "a fallback that is too strict locks users
  // out of the product. When in doubt, be generous and log."
  it('never renders NaN or Infinity as a count', () => {
    for (const remaining of [NaN, Infinity, -Infinity]) {
      const d = scanDisclosure({ ...base, remaining });
      expect(d.level).toBe('hidden');
      expect(d.text).toBe('');
    }
  });

  it('never renders an unusable limit', () => {
    for (const limit of [NaN, Infinity, 0, -1]) {
      expect(scanDisclosure({ ...base, remaining: 0, limit }).level).toBe('hidden');
    }
  });

  it('floors a fractional remainder rather than printing "1.5 scans left"', () => {
    // 1.5 remaining means one WHOLE scan is available.
    const d = scanDisclosure({ ...base, remaining: 1.5 });
    expect(d.level).toBe('last');
    expect(d.text).not.toContain('1.5');
  });

  it('drops the reset clause rather than printing an unusable date', () => {
    // resetsAtMs: 0 is exactly what a loading hook's "safe default" emits, and
    // it used to render "resets Jan 1" — 1970.
    for (const resetsAtMs of [0, NaN, -1, Infinity]) {
      const text = scanDisclosure({ ...base, remaining: 0, resetsAtMs }).text;
      expect(text).toBe("You've used your 2 free scans this month");
      expect(text).not.toContain('Invalid Date');
      expect(text).not.toContain('Jan 1');
    }
  });
});

describe('scanDisclosure — never accuse a subscriber mid-load', () => {
  // The promise in the plan's Phase 2 preamble: "the UI never flashes a wall at
  // a Pro user". unlimited and paywallEnabled arrive from SEPARATE async hooks.
  // useMonetizationConfig is memoised per session and can resolve instantly
  // (paywallEnabled: true) while useEntitlement's onSnapshot is still in flight
  // (unlimited: false, the spec'd default) and useScanQuota reads remaining: 0.
  // Composed, that put a wall in front of a paying subscriber.
  it('is hidden while any input is still loading, even at zero remaining', () => {
    const d = scanDisclosure({ ...base, remaining: 0, resetsAtMs: 0, loading: true });
    expect(d.level).toBe('hidden');
    expect(d.text).toBe('');
  });

  it('shows the wall once loading settles', () => {
    expect(scanDisclosure({ ...base, remaining: 0, loading: false }).level).toBe('wall');
  });
});

describe('groupDisclosure', () => {
  const g = { unlimited: false, paywallEnabled: true, activeCount: 2, limit: 2 };

  it('flags the cap once the active count reaches the limit', () => {
    const d = groupDisclosure(g);
    expect(d.atCap).toBe(true);
    expect(d.text).toBe('2 of 2 groups active');
  });

  it('is silent below the cap', () => {
    expect(groupDisclosure({ ...g, activeCount: 1 })).toEqual({ atCap: false, text: '' });
  });

  it('never shows a cap to a Pro subscriber', () => {
    expect(groupDisclosure({ ...g, unlimited: true }).atCap).toBe(false);
  });

  it('never shows a cap while enforcement is dark', () => {
    expect(groupDisclosure({ ...g, paywallEnabled: false }).atCap).toBe(false);
  });

  it('clamps the displayed count so an over-cap user never reads "3 of 2"', () => {
    // Legacy owners can sit above a cap that was tightened under them, and
    // "3 of 2 groups active" reads as a bug to the user.
    const d = groupDisclosure({ ...g, activeCount: 3 });
    expect(d.atCap).toBe(true);
    expect(d.text).toBe('2 of 2 groups active');
  });

  it('renders the configured limit, not a hardcoded one', () => {
    expect(groupDisclosure({ ...g, activeCount: 5, limit: 5 }).text).toBe('5 of 5 groups active');
  });

  // THE DANGEROUS DIRECTION. `activeCount < limit` is false for any NaN, so the
  // fall-through used to be atCap:true — blocking group creation for a free
  // user whose config hook had not resolved, and rendering "NaN of NaN groups
  // active". scanDisclosure failed OPEN on the same garbage. Same file,
  // opposite directions; open is the correct one for both.
  it('fails OPEN on unusable numbers instead of locking the user out', () => {
    const bad = [
      { activeCount: 1, limit: NaN },
      { activeCount: NaN, limit: 2 },
      { activeCount: 1, limit: undefined as unknown as number },
      { activeCount: Infinity, limit: 2 },
      { activeCount: 1, limit: 0 },
    ];
    for (const patch of bad) {
      const d = groupDisclosure({ ...g, ...patch });
      expect(d.atCap).toBe(false);
      expect(d.text).toBe('');
    }
  });

  it('is open while still loading, even at the cap', () => {
    expect(groupDisclosure({ ...g, loading: true }).atCap).toBe(false);
  });
});
