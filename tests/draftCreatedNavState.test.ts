/**
 * AIScanView keeps its instance across /bill/new -> /bill/<id> ONLY when the
 * navigation carries DRAFT_CREATED_NAV_STATE (see AIScanView's wrapper). A
 * draft-creation swap that forgets the flag remounts the page mid-scan and
 * discards the scan + upload preview, so every such call site must pass it.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';

const SITES: Array<[string, number]> = [
  ['src/pages/AIScanView.tsx', 2], // handleEventChange (event + private)
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
