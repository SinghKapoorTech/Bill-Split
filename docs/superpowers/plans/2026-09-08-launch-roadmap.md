# Divit Launch Roadmap — paid tier, then pre-launch hardening

**Status:** PLANNING — nothing in chunks 4-6 started
**Created:** 2026-09-08
**Spec:** `docs/superpowers/specs/2026-09-06-monetization-design.md`
**Decision (2026-09-08):** **Mobile IAP first** — App Store + Play via the
RevenueCat native SDK. Web billing is deliberately out of scope for launch.

This is the sequencing document. Each chunk gets its own detailed plan file when
it starts, following the existing `2026-09-06-monetization-chunk-N-*.md`
convention. **Do not write chunks 5-6 in detail until chunk 4 lands** — the
webhook's real shape will change them.

---

## Where we actually are

|                                     | Status                                           |
| ----------------------------------- | ------------------------------------------------ |
| Chunk 1 — security prerequisites    | ✅ shipped (`becef89`, `5ec53e2`, `1dc5343`)     |
| Chunk 2 — event archive             | ✅ shipped (`20bfeb9`, `d813dd2`)                |
| Chunk 3 — free-tier cap enforcement | ✅ shipped to prod (`e7cbe4b`), **running dark** |
| Chunk 4 — RevenueCat subscriptions  | ❌ not started                                   |
| Chunk 5 — Trip Pass                 | ❌ not started                                   |
| Chunk 6 — paywall + quota UI        | ❌ not started                                   |

**There is currently no way for anyone to pay.** That is the only thing standing
between here and revenue; everything else on the backlog is quality work.

**Enforcement is live and dark.** `paywall_enabled: false` in prod. Every cap
computes `wouldBlock`, logs, and permits. Nothing writes `entitlements/{userId}`,
so every user resolves to `free` — the correct steady state, not a bug.

### What the ground truth said (2026-09-08, read-only prod query)

139 users · 60 bills · 17 bills touched in 30 days · **0 `usage` documents**.

Zero usage docs is real signal, not a recording gap: `commitScanQuotaUsage`
(`functions/src/index.ts:520`) runs regardless of `paywallEnabled` — only the
throw is gated. So **zero AI scans have happened since chunk 3 deployed.**

Combined with the owner's confirmation that all Firestore data is test data and
will be wiped before launch, this kills one idea outright: **there is no usage
history to mine for pricing validation.** The caps (5 scans/month, 2 active
owned groups) cannot be validated until real users exist. That is precisely why
analytics must ship _with_ the paywall, not after it.

---

## Sequencing

### Track A — yours, starts today, pure calendar latency

Not code. Blocks release no matter how ready the code is, and the spec flags it
as "**days**, not hours — start early" (§6.2).

- [ ] App Store Connect: create **3 products** — monthly sub, annual sub, Trip Pass consumable
- [ ] Play Console: the same 3 products
- [ ] Tax and banking forms on both (the actual long pole)
- [ ] RevenueCat account + project; link both stores; get the public SDK keys
- [ ] Rewrite `appstore/listing.md:64` — it still says "Divit is free to use."

**Blocking relationship:** chunk 4's code can be written and unit/integration
tested without any of this. It cannot be _manually verified_ end to end until the
products exist and RevenueCat is linked. Start Track A now or it becomes the
critical path later.

### Track B — mine, in order

| Chunk | What                                                                       | Gated on                                       |
| ----- | -------------------------------------------------------------------------- | ---------------------------------------------- |
| **4** | RevenueCat webhook → `entitlements/{userId}`, native SDK wiring, App Check | nothing (Track A only for manual verification) |
| **5** | Trip Pass purchase path + reconciliation on foreground                     | chunk 4                                        |
| **6** | Paywall UI, progressive quota disclosure (§4.3.1), **analytics**           | chunks 4-5                                     |
| **7** | Pre-launch hardening (below)                                               | none — can interleave                          |

**Why App Check is inside chunk 4, not a separate item:** spec §6.1 lists it as
required "once scans are a sold good," and it is a prerequisite for chunk 4
rather than part of it. Absent entirely today — zero `initializeAppCheck` in
`src/` or `functions/src/`.

**Why analytics is inside chunk 6, not after:** there are zero `logEvent` calls
today. A paywall shipped without funnel instrumentation is one you cannot tune,
and per the ground-truth section there is no historical data to fall back on.
Minimum set (§6.4): scan performed, cap reached, paywall viewed, purchase
started, purchase completed, group created, settlement completed.

---

## Chunk 7 — pre-launch hardening

Everything here is real, none of it blocks revenue, and **none of it costs
anything today** — no real users, no real money, and the database gets wiped
(spec §6.5 explicitly says no migration or backfill is needed for that reason).
It must be right before real users arrive, not before the next commit.

In priority order:

1. **Push notifications** (§6.3) — `@capacitor/push-notifications` is not in
   `package.json`. The spec calls this "the biggest launch risk": subscriptions
   monetize month two, and an app that cannot re-engage is a one-session app.
   Minimum set: settle-up reminder, "someone claimed their items," "you were
   added to a bill."
2. **The people-loss sweep** — `usePeopleAdditionQueue` cross-bill mis-flush
   (destructive), `/transaction/:billId` evicting a joined guest,
   `/shared/:sessionId` adopting snapshots with no in-flight guard,
   `useBillSession.ts:132` reading `people` before its `await`. Same defect
   class; `reconcilePeopleWithServer` already exists and is fuzz-verified
   (300k cases, 0 mismatches), so most of this is mechanical.
   Full detail: `docs/handoffs/people-race-0907-part3.md` #3-#9.
3. **The settle-path e2e flake** — `e2e/settle-bill.spec.ts:100`, currently
   green-on-retry in CI. Worth an hour _before_ chunk 6: if it is a genuine race
   in settle rather than test flake, it is in the money path and you do not want
   to find that out after taking payments.
4. **`useReceiptAnalyzer.ts:53` burns a scan on failure** — throws after the
   server consumed quota. Cheap, and becomes user-visible the moment caps go
   live. Could fold into chunk 4.
5. **Remaining §6.1 items** — `ADMIN_UIDS` still hardcoded
   (`functions/src/index.ts:913`; admin-guarded, low risk).
6. **Store compliance** — Restore Purchases (must restore an unexpired Trip Pass,
   not just subscriptions), paywall disclosure per Guideline 3.1.2 (price,
   duration, Terms + Privacy links on the paywall itself; the Trip Pass sheet
   must additionally state it does **not** renew and is non-refundable).
   Sign in with Apple is already done (`c144ad2`).
7. **`APPLE_SIGNIN_PRIVATE_KEY` is a placeholder on beta** — `deleteAccount` and
   Apple token revocation are broken there. Affects store-compliance testing.

---

## Turning it on

The paywall goes live by Remote Config, not by a deploy:

```bash
I_MEAN_IT=1 npm run rc:publish -- prod
```

The `I_MEAN_IT` guard only fires when `paywall_enabled` is `true`.

**Never publish Remote Config from the console or with `firebase remoteconfig:*`.**
Those write the `firebase` (client) namespace; `getServerTemplate()` in functions
reads `firebase-server`. Publishing the wrong namespace fails **safe but
silent** — caps evaluate, log, and permit anyway, with no visible error.
Measured on beta 2026-09-07: missing server template → unarchive at cap
succeeded (200); published → blocked (429), same code and data. Only
`npm run rc:publish` writes both namespaces.

Allow up to **5 minutes** propagation (functions cache the template) plus
instance recycling.

---

## Standing constraints

- **Pushing `main` auto-deploys the backend to PROD** when the diff touches
  `functions/**`, `shared/**`, `firestore.rules`, `firestore.indexes.json`,
  `storage.rules`, `firebase.json`, or `.firebaserc`. Chunk 4 touches
  `functions/**` — so every chunk-4 push is a production backend deploy.
  Every push also uploads a draft AAB to Play.
- **`events` is `allow create: if false`** — a hard cutover with no back-out,
  owner-confirmed 2026-09-06. Installed old binaries can never create events
  again. This is why the minimum-version gate exists.
- **Never `where('archived','==',false)`** — Firestore does not match documents
  missing the field, and legacy events have no `archived` field. Count by
  subtraction.
- **`firestore.indexes.json` full deploy fails on BETA** on a pre-existing
  `event_balances` index conflict. For beta use
  `firebase deploy --only firestore:rules --project beta`. Prod deploys clean.
- Commit messages must not contain `Co-Authored-By` or any Claude/Anthropic
  reference (repo `CLAUDE.md`).
