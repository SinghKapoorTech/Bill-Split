/**
 * AIScanView / AirbnbView keep their instance across /bill/new -> /bill/<id> ONLY when the
 * navigation carries DRAFT_CREATED_NAV_STATE (see AIScanView's wrapper). A
 * draft-creation swap that forgets the flag remounts the page mid-scan and
 * discards the scan + upload preview, so every such call site must pass it.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';

const SITES: Array<[string, number]> = [
  ['src/pages/AIScanView.tsx', 2], // handleEventChange (event + private)
  ['src/pages/AirbnbView.tsx', 2], // handleEventChange (event + private)
  ['src/components/bill-wizard/BillWizard.tsx', 1], // post-scan save
  ['src/components/bill-wizard/hooks/useBillSession.ts', 1], // auto-save
];

// A navigate(...) to a freshly returned bill id, with its options object.
const DRAFT_SWAP = /navigate\(\s*`[^`]*\/\$\{(?:newBillId|newId|returnedId)\}`\s*,\s*\{[^}]*\}/g;

describe('draft-creation URL swaps carry DRAFT_CREATED_NAV_STATE', () => {
  it.each(SITES)('%s', (file, expected) => {
    const src = readFileSync(path.resolve(__dirname, '..', file), 'utf8');
    const swaps = src.match(DRAFT_SWAP) ?? [];
    expect(swaps).toHaveLength(expected); // marker found — not vacuous
    for (const s of swaps) {
      expect(s).toContain('replace: true');
      expect(s).toContain('state: DRAFT_CREATED_NAV_STATE');
    }
  });
});

// A swap that lands after the page unmounted (user started another new bill
// mid-save) would bind the fresh page to this bill's id. Each swap's guarding
// `if` must check isMounted.current. Behaviour is pinned for useBillSession in
// tests/react/draftSwapAfterUnmount.test.tsx; this covers the other sites.
const SWAP_SITES: Array<[string, RegExp, number]> = [
  ...SITES.map(([f, n]) => [f, DRAFT_SWAP, n] as [string, RegExp, number]),
  [
    'src/components/simple-transaction-wizard/SimpleTransactionWizard.tsx',
    /window\.history\.replaceState\(\{\}, '', `\/transaction\/\$\{newId\}`\)/g,
    1,
  ],
];

describe('draft-creation URL swaps are skipped once unmounted', () => {
  it.each(SWAP_SITES)('%s', (file, re, expected) => {
    const src = readFileSync(path.resolve(__dirname, '..', file), 'utf8');
    const hits = [...src.matchAll(new RegExp(re.source, 'g'))];
    expect(hits).toHaveLength(expected); // marker found — not vacuous
    for (const h of hits) {
      const guard = src.slice(src.lastIndexOf('if (', h.index!), h.index!);
      expect(guard).toContain('isMounted.current');
    }
  });
});
