# Phase 1 complete + machine handoff (2026-09-09)

Free/paid tier launch, Phase 1 (server contract) is **done, verified against a
real deployed backend, and pushed**. This document covers what was verified,
what changed OUTSIDE the repo (which git cannot carry), and how to pick the work
up on a different machine for Phase 2.

Plan: `docs/superpowers/plans/2026-09-09-free-and-paid-tier-launch.md`

---

## 1. What Phase 1 shipped

Six commits, `f5824eb..b88c937`:

| Commit    | What                                                              |
| --------- | ----------------------------------------------------------------- |
| `f5824eb` | Free tier is 2 AI scans/month (was 5)                            |
| `b33b6a4` | Cap errors carry structured `details` for the client             |
| `1cb3bb1` | Pin that failed scans never consume quota                        |
| `92ac7bd` | Cover the Remote Config limits loader                            |
| `cc0631a` | Close four holes an adversarial review found                     |
| `b88c937` | Fix `rc:publish` on Windows (unrelated bug found while verifying) |

885 lines changed, but only **132 in production files** — of which 88 are one new
pure module (`shared/capErrors.ts`) and 10 are a comment. Three of the six
commits changed no production behaviour at all. The real behaviour delta is: the
cap moved 5→2, and three `resource-exhausted` throws gained a typed payload.

### Gates at the time of push

```
npm test                    779 passed / 47 files
typecheck                   36 errors      (ratchet, ZERO headroom — do not exceed)
lint                        71 real        (77 raw − 6 from git-ignored android build artifacts)
npm --prefix functions build exit 0
npm run build               exit 0
npm run test:integration    269 passed / 21 files
```

> **The lint gate reads 77, not 71.** Six problems come from
> `android/app/build/intermediates/**/native-bridge.js` — generated Capacitor
> output that is git-ignored but still linted. Adding `android/**/build/**` to
> the eslint ignores is a worthwhile one-line follow-up; until then, subtract 6.

---

## 2. Verified against real infrastructure (not just CI)

Phase 1's exit checkpoint was run on **beta** on 2026-09-09. Both caps were
exercised end to end through the deployed Cloud Functions and the payloads read
off the wire:

```
GROUP CAP  (createEvent, 3rd call)
  HTTP 429  RESOURCE_EXHAUSTED
  message   "You have 2 active groups. Archive one you're finished with, or go unlimited with Pro."
  details   {"reason":"group-cap","activeCount":2,"limit":2}

SCAN QUOTA (analyzeBill, usage seeded to the cap)
  HTTP 429  RESOURCE_EXHAUSTED
  message   "You've used all 2 free scans this month. Your scans reset on October 1. Upgrade to Pro for unlimited scanning."
  details   {"reason":"scan-quota","used":2,"limit":2,"resetsAtMs":1790812800000}
            resetsAtMs decodes to 2026-10-01T00:00:00Z — matches the prose exactly

A5 ROLLBACK  paywall_enabled=false → 3rd group created (HTTP 200). Wall gone, no deploy.
```

The scan-quota case cost no Gemini call: `usage/{uid}` was seeded to the cap and
the quota gate runs *before* the model call.

**A5 is the important one.** The kill switch works in both directions without a
deploy.

Verification scripts are NOT committed (they create throwaway users). Recreate
from this doc if needed; the shape is: sign up via Identity Toolkit REST → seed
`usage/{uid}` via Firestore REST → POST the callable with `Authorization: Bearer <idToken>`.

---

## 3. Changes made OUTSIDE the repo — git does not carry these

### divit-beta (staging)

| Change                                             | Why                                                  | Reversible                  |
| -------------------------------------------------- | ---------------------------------------------------- | --------------------------- |
| `REVENUECAT_WEBHOOK_SECRET` created                | deploy aborts without it                             | throwaway value; safe to rotate |
| 8 missing functions deployed                       | beta was behind prod                                 | n/a                         |
| **Email/Password sign-in enabled**                 | needed a headless test login; only Google was on     | yes — see below             |
| **`analyzebill` granted `allUsers` run.invoker**   | it had NO binding: scanning had NEVER worked on beta | leave it; matches prod      |
| Remote Config published v4→v7, ending at `false`   | the checkpoint                                       | n/a                         |

**Beta now diverges from prod** in one way: Email/Password sign-in is enabled on
beta and not on prod. Revert with:

```bash
TOKEN=$(gcloud auth print-access-token)
curl -X PATCH -H "Authorization: Bearer $TOKEN" -H "x-goog-user-project: divit-beta" \
  -H "Content-Type: application/json" \
  "https://identitytoolkit.googleapis.com/admin/v2/projects/divit-beta/config?updateMask=signIn.email.enabled" \
  -d '{"signIn":{"email":{"enabled":false}}}'
```

Left on beta: 3 throwaway users (`phase1-verify-*`, `scanquota-*`) and 5 test
groups. Harmless; delete whenever.

### divit-6d217 (prod)

**Nothing was changed.** Prod Remote Config was never published to.

---

## 4. Open issues to carry forward

### 4.1 Prod Remote Config is DRIFTED from the repo

`config/remote-config/prod.json` says `free_scans_per_month: 2` (committed in
`f5824eb`), but **live prod still serves 5**. Harmless while
`paywall_enabled=false` — nothing enforces — but the repo and live config now
disagree, and the pre-Phase-1 audit specifically recorded "zero drift".

Publishing prod RC is a deliberate step, not an afterthought:

```bash
npm run rc:publish -- prod --dry-run   # confirm paywall stays false
npm run rc:publish -- prod
```

### 4.2 `analyzeBill` had never been invokable on beta

Fixed, but note what it means: **any earlier claim that a scan path was "tested
on beta" is false** — it could not have been. This matters for Phase 6, where the
plan says to enable App Check on `analyzeBill` "beta first, then prod".

### 4.3 Flip-day policy is undecided

While enforcement is dark the server still commits `scansThisPeriod`, so counts
climb past the cap indefinitely. Halving 5→2 doubles the cohort that is already
over the cap on the day the switch flips, and there is no "0 scans left" UI yet
(that is Phase 3). Decide before Phase 8: either flip on a UTC month boundary, or
zero `scansThisPeriod` as part of enabling enforcement.

Owner states there are no real users yet, which would make this moot — confirm
with real counts before relying on it.

### 4.4 Test-quality lesson worth keeping

Six tests written during Phase 1 passed for the wrong reason. Two were caught by
self-mutation, four by an adversarial review. The worst let the ENTIRE
scan-quota `details` payload be deleted while 31 tests stayed green, because
assertions counted `reason:` occurrences across the whole file instead of within
each throw.

**Green on first write is when a test deserves the least trust.** Mutate the
source and watch it go red before believing it.

---

## 5. Picking this up on a Mac

### 5.1 Clone and install

```bash
git clone https://github.com/<owner>/Bill-Split.git
cd Bill-Split
npm install
npm --prefix functions install
```

There is no `.nvmrc`. This work was done on **Node 24.16.0**; `functions/`
targets the **Node 20** runtime (`functions/package.json` engines).

### 5.2 Files that do NOT travel — recreate them

Both are gitignored and hold the Firebase web client config:

| File        | Purpose                    | Recreate with                                                                          |
| ----------- | -------------------------- | -------------------------------------------------------------------------------------- |
| `.env`      | prod web config (`npm run dev`) | `firebase apps:sdkconfig WEB --project prod`                                       |
| `.env.beta` | beta web config (`npm run dev:beta`) | `firebase apps:sdkconfig WEB 1:509877505233:web:0f116340b5bf8fdcaec9f0 --project beta` |

`.env.beta` also needs `VITE_USE_EMULATORS=false` at the top to force the real
beta backend over any local emulator setting.

### 5.3 Tooling

```bash
brew install openjdk          # REQUIRED by the Firestore emulator (integration + rules tests)
echo 'export PATH="/opt/homebrew/opt/openjdk/bin:$PATH"' >> ~/.zshrc && source ~/.zshrc
java -version

npm i -g firebase-tools @revenuecat/cli vercel
npx playwright install chromium

gcloud auth login
gcloud auth application-default login
gcloud auth application-default set-quota-project divit-6d217
firebase login
rc auth login                 # RevenueCat CLI (browser OAuth)
```

### 5.4 MCP servers do not sync

MCP config lives in `~/.claude.json` per machine. Re-add on the Mac:

```bash
claude mcp add --transport http revenuecat https://mcp.revenuecat.ai/mcp -s user
claude mcp add --transport http vercel     https://mcp.vercel.com        -s user
claude mcp add firebase -s user -- firebase experimental:mcp
```

Then run `/mcp` and authenticate revenuecat + vercel (browser OAuth).

Notes:

- On macOS the firebase server does NOT need the `cmd /c` wrapper the Windows
  config used. Point it at the globally installed binary rather than
  `npx -y firebase-tools@latest`, which re-downloads a very large package on
  every launch and blows the 30s handshake.
- **Claude Code reads its MCP list once at startup.** After `claude mcp add`,
  restart Claude Code or the new servers will not appear in `/mcp`.
- GitHub's remote MCP cannot do OAuth (`does not support dynamic client
  registration`) and needs a PAT in plaintext. The `gh` CLI is the better path.

### 5.5 The Mac unlocks iOS — this is the real reason to switch

Windows cannot build the iOS half at all (no `xcodebuild`/`pod`/`swift`).
The repo already has a full `ios/App` Capacitor project. On the Mac:

```bash
npx cap sync ios
open ios/App/App.xcworkspace
```

Phase 4 needs this, plus a sandbox purchase on a **physical iPhone**.

### 5.6 Sanity-check the machine before writing code

```bash
npm test                       # expect 779 / 47
npm run --silent typecheck 2>&1 | grep -c 'error TS'   # expect 36
npm --prefix functions run build                        # expect exit 0
npm run test:integration       # expect 269 / 21  (needs Java)
```

If integration takes more than a couple of minutes, something is wrong with the
environment, not the tests — on Windows this suite ran 149× slower than normal
when the working tree sat inside a syncing OneDrive folder (11,287s vs 75s).
Keep the repo out of a syncing cloud folder.

---

## 6. Phase 2 starts here

**Phase 2 (client state) blocks on nothing** — not Apple, not Google, not
RevenueCat. It is read-only hooks plus pure logic:

- `useEntitlement` — subscribe to `entitlements/{uid}`
- `useScanQuota` — subscribe to `usage/{uid}`, evaluate with `shared/scanQuota.ts`
- `useGroupCap` — filter the owned-events subscription by `ownerId === uid`
- `monetizationConfigService` + `useMonetizationConfig` — the three RC keys
- the disclosure ladder (`tests/quotaDisclosure.test.ts`)

Every hook returns a `loading` flag and a safe default so the UI never flashes a
wall at a Pro user or hides one from a free user. Fail-safe on config failure is
`{paywallEnabled: false, scans: 2, groups: 2}` — dark.

The server contract Phase 2 renders against is now **proven live** (§2). Use
`shared/capErrors.ts` — `isCapErrorDetails` to narrow, `isPaywallTrigger` to
decide whether to show an upgrade wall. Do **not** collapse those two: the hourly
rate limiter is a `CapErrorDetails` but NOT a paywall trigger, and showing an
upgrade offer to a Pro subscriber who merely scanned too fast is a lie.

`resetsAtMs` must be rendered with `timeZone: 'UTC'` — see the comment on the
field in `shared/capErrors.ts`.

### Still blocked, still the calendar long pole

Apple **Paid Applications agreement + tax + banking**, and the Play **payments
profile**. Phase 4 onward is dead until both read Active. RevenueCat project
`projaca9e24b` is at zero: 1 Test Store app, 0 products, 0 entitlements,
0 offerings, 0 webhooks.
