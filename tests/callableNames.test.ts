/**
 * The client invokes Cloud Functions by NAME STRING. A typo there compiles
 * fine, passes every other test (the integration suite drives the exported
 * cores directly, bypassing the callable layer) and then fails 100% at runtime.
 *
 * This is a cheap static guard: every name the client calls must exist as an
 * exported callable in functions/src, and must be re-exported from index.ts —
 * only exports in index.ts are actually deployed.
 */
import { readFileSync } from 'fs';
import path from 'path';
import { describe, it, expect } from 'vitest';

const ROOT = path.resolve(__dirname, '..');
const read = (p: string) => readFileSync(path.join(ROOT, p), 'utf8');

/** Names passed to httpsCallable(functions, '<name>') anywhere in src/. */
function clientCallableNames(): string[] {
  const files = [
    'src/services/squadService.ts',
    'src/services/settlementService.ts',
    'src/services/accountService.ts',
  ];
  const names = new Set<string>();
  for (const f of files) {
    const src = read(f);
    for (const m of src.matchAll(/httpsCallable<[\s\S]*?>\(\s*functions,\s*'([^']+)'/g)) {
      names.add(m[1]);
    }
    // callSquadFn<...>('name') wrapper form
    for (const m of src.matchAll(/callSquadFn<[\s\S]*?>\(\s*'([^']+)'\s*\)/g)) {
      names.add(m[1]);
    }
  }
  return [...names];
}

const index = read('functions/src/index.ts');

describe('client callable names resolve to deployed functions', () => {
  const names = clientCallableNames();

  it('finds the callables the client actually uses', () => {
    // Guards the guard: if the regexes stop matching, this test must fail
    // loudly rather than silently verify an empty list.
    expect(names.length).toBeGreaterThanOrEqual(4);
    expect(names).toContain('createSquad');
  });

  it.each(clientCallableNames())('%s is exported from functions/src/index.ts', (name) => {
    const declared = new RegExp(`export const ${name}\\b`).test(index);
    const reExported = new RegExp(`export \\{[^}]*\\b${name}\\b[^}]*\\}`).test(index);
    expect(declared || reExported).toBe(true);
  });
});
