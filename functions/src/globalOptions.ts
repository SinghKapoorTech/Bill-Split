import { setGlobalOptions } from 'firebase-functions/v2/options';

/**
 * Global spend ceiling for every function in this codebase.
 *
 * This MUST live in its own module, imported first by `index.ts`.
 *
 * `firebase-functions` snapshots the global options at function DEFINITION
 * time. ESM evaluates all imported modules before the importing module's own
 * body runs, so calling `setGlobalOptions()` inside `index.ts` would happen
 * AFTER `ledgerProcessor.ts`, `friendAddProcessor.ts`, `billFunctions.ts` etc.
 * had already registered their triggers — leaving exactly those functions
 * pinned to the platform default of 1,000 concurrent instances.
 *
 * That default is the real hazard: `ledgerProcessor` writes back to the `bills`
 * collection that triggers it, so a bug there is a self-feeding billing
 * incident on a Blaze project. 50 is well above real load for the current
 * userbase while capping the blast radius.
 *
 * Verify after changing this:
 *   cd functions && npm run build && node -e "
 *     const m=require('./lib/functions/src/index.js');
 *     for (const k of Object.keys(m)) console.log(k, m[k]?.__endpoint?.maxInstances);
 *   "
 * A value of `null`/`ResetValue` means UNCAPPED — that is a failure.
 */
setGlobalOptions({ maxInstances: 50 });
