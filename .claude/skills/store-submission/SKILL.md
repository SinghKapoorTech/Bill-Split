---
name: store-submission
description: Pre-submission compliance gate for Divit (App Store + Google Play). Use before any App Store Connect upload, Play Console release, TestFlight promotion to production, or when a build was rejected and needs a fix plan. Also use when changing auth, camera/photo permissions, the Venmo hand-off, Gemini receipt analysis, deep links, account/data deletion, or anything that alters what data leaves the device.
---

# Divit store submission gate

Divit is **not a native Xcode app**. It is a React + TypeScript web app wrapped in
Capacitor (`capacitor.config.ts`, appId `com.singhkapoortech.divit`), with a
Firebase backend and Cloud Functions. Almost all app logic is TypeScript under
`src/`, not Swift under `ios/App/App/`.

That matters because the generic App Store skills installed globally scan for
native patterns and will under-report on this repo. Their known blind spots on
this stack are recorded in "What the generic skills miss" below. **Run this gate
in addition to them, never instead of them.**

## First-time setup on a new machine

This skill ships with the repo. The companions it references do not — they are
per-machine and must be cloned once:

```bash
# Apple guideline reasoning (covers 4.8 and 5.1.1(v) well)
git clone https://github.com/safaiyeh/app-store-review-skill ~/.claude/skills/app-store-review

# App Store Connect REST API — metadata, screenshots, build attach, submit
git clone https://github.com/199-biotechnologies/app-store-connect-skill ~/.claude/skills/app-store-connect

# Reference corpus only — Capacitor, privacy manifests, regulatory. Not a skill.
git clone https://github.com/mjmirza/app-store-compliance ~/repositories/app-store-compliance
```

`app-store-connect` needs an App Store Connect API key (`.p8`) in its
`config/credentials.local.md`; mint it under Users and Access → Integrations.

## How to run

1. Work the blocking gate table below. Every row has a verification command —
   run it and read the output. Do not mark a row from memory.
2. Then run the guideline pass with the global `app-store-review` skill
   (`~/.claude/skills/app-store-review`) for Apple guideline reasoning.
3. For Capacitor-, privacy-manifest-, and regulatory-specific questions, read
   from the reference corpus at `~/repositories/app-store-compliance` —
   `docs/CROSS-PLATFORM-FRAMEWORKS.md`, `references/rules/privacy.md`,
   `docs/PRE-SUBMISSION-CHECKLIST.md`.
4. Report honestly per the Production Readiness Gate in `CLAUDE.md`: what was
   verified, what was not, what remains open.

**Do not register `app-store-compliance-guard.sh` as a hook.** It reports
`hostname: "localhost"` in `capacitor.config.ts` as a critical staging-backend
leak (that string is the standard Capacitor WKWebView origin), and its
account-deletion detector is masked by `node_modules/firebase`, so it returns a
false negative on the single worst issue in this repo. Verified 2026-09-05.

## Blocking gate — must be clear before upload

| # | Risk | Guideline | Verify with |
| --- | --- | --- | --- |
| 1 | No in-app account deletion | Apple 5.1.1(v); Play User Data | `grep -rniE 'deleteAccount\|account deletion' src functions/src` |
| 2 | Google-only sign-in | Apple 4.8 | `grep -n 'AuthProvider' src/contexts/AuthContext.tsx` |
| 3 | No app-level privacy manifest | Apple privacy manifest policy | `find ios -name PrivacyInfo.xcprivacy` |
| 4 | Venmo hand-off breaks with Venmo not installed | Apple 2.1 | read `src/utils/venmo.ts` `openVenmoApp` |
| 5 | Unverified `divit://` deep link | Apple 2.1; Play | `ls public/.well-known; find ios -name '*.entitlements'` |
| 6 | Gemini data sharing undeclared | Apple 5.1.1; Play Data Safety | `grep -rn 'gemini' functions/src/index.ts` |
| 7 | Android backup of financial data | Play security | `grep -n allowBackup android/app/src/main/AndroidManifest.xml` |
| 8 | Stale Play target API | Play target API requirement | `grep -n targetSdkVersion android/variables.gradle` |
| 9 | iOS/Android version drift | metadata | `grep -n MARKETING_VERSION ios/App/App.xcodeproj/project.pbxproj; grep -n versionName android/app/build.gradle` |
| 10 | Support URL with no contact route | Apple 1.5 | `grep -n 'Support URL' -A3 appstore/listing.md` |

### 1. Account deletion (highest severity)

Apple requires deletion to be **initiated from inside the app**. An email
address is not sufficient and is a known rejection trigger. Note that
`src/pages/PrivacyPolicy.tsx` currently promises email-based deletion — if the
in-app flow lands, that copy must change with it, or the listing contradicts the
binary.

Deletion has to cascade the ledger, not just remove the auth user. Collections
holding user-linked data: `users`, `bills`, `balances`, `event_balances`,
`settlements`, `events`, `eventInvitations`, and recurring bills. A naive delete
corrupts counterparties — a bill has `participantIds` on both sides, and
`balances/{uid1_uid2}` is a shared document that the other user still reads.
Deleting one side must reverse that user's footprint through the pipeline
(`processedBalances` / `processedEventBalances`), not orphan the pair doc.
`settlements` are immutable records; decide explicitly whether they are
anonymized or retained, and say which in the privacy policy.

Reviewer-facing: the flow must be reachable without support contact. `SettingsView.tsx`
is the natural home.

### 2. Sign in with Apple

`AuthContext.tsx` offers Google only. Apple 4.8 requires that an app using a
third-party login service also offer a provider limiting collection to name and
email with an option to hide the email. This is also the reviewer-access path —
Google routinely blocks sign-in from unfamiliar locations, which gets a build
rejected as "unable to sign in". `appstore/listing.md` already documents both
risks; keep it in sync with whatever ships.

### 3. Privacy manifest

Capacitor plugin manifest coverage is less standardized than Flutter's. Ship an
app-level `ios/App/App/PrivacyInfo.xcprivacy` declaring required-reason API use
and collected data types, and verify each plugin wrapping a native SDK carries
its own. Plugins in use: `@capacitor/camera`, `@capacitor/filesystem`,
`@capacitor/haptics`, `@capacitor/splash-screen`, `@capacitor/status-bar`,
`@capacitor/app`, `@capacitor-firebase/authentication`.

Whatever the manifest declares must match the App Store Connect App Privacy
answers and the Play Data Safety form. Reviewers compare them.

### 4. Venmo hand-off

`openVenmoApp` sets `window.location.href` to the `venmo://` scheme, then falls
back to the universal link after 2500ms. On an iOS review device without Venmo
installed — the normal case — the scheme attempt surfaces an error before the
fallback fires. Prefer the universal link first on iOS, or gate the scheme
behind a real installed-app check. `isVenmoInstalled()` only sniffs the user
agent; it does not detect Venmo.

Divit does not process payments and takes no commission, so Guideline 3.1.1 does
not apply — this is real-world peer-to-peer money movement handled entirely by
Venmo. State that plainly in the review notes so it is not mistaken for
circumventing in-app purchase.

### 6. Gemini receipt analysis

Receipt photographs leave the device and are sent to Google Gemini by
`analyzeBill` in `functions/src/index.ts`. This is third-party data sharing of
user content and must appear as such in App Privacy and Data Safety.
`src/pages/PrivacyPolicy.tsx` does name Gemini — keep that true.

If the app ships to the EU, AI-output transparency under the EU AI Act
Article 50 applies; see `docs/EU-REGULATORY-2026.md` in the reference corpus.
Extracted line items are AI estimates the user can edit before splitting, which
is the right design — make sure the UI says so.

## What the generic skills miss on this repo

Verified 2026-09-05 against the installed copies.

- `app-store-review` (safaiyeh): zero occurrences of `capacitor` or `xcprivacy`
  across all five rule files. Covers gate rows 1 and 2 well
  (`rules/5-legal.md`, `rules/4-design.md`); will not raise rows 3, 4, or 5.
- `app-store-compliance` (mjmirza): good on Capacitor and privacy manifests, but
  its scanner produced two false-positive criticals and a false negative on
  row 1 here. Use its `docs/` and `references/` as reading, not its exit code.
- Neither knows anything about the Venmo hand-off, the Gemini path, or the
  ledger-cascade shape of account deletion. Those live in this file.

## Store mechanics

**`appstore/SUBMISSION.md` is the authority on submission state and ASC
mechanics — read it first and keep it current.** It records the live in-flight
state, the screenshot-slot traps, and what is genuinely web-only. Do not restate
its contents here; this file is about code compliance, that one is about
process.

In short: listing copy lives in `appstore/listing.md`; renders are in
`appstore/out/` (6.9", 1320×2868) and `appstore/out-ipad/` (13", 2064×2752),
with iPad required because `TARGETED_DEVICE_FAMILY = "1,2"`. Play assets are in
`play-store-assets/`.

The global `app-store-connect` skill (`~/.claude/skills/app-store-connect`)
drives the ASC REST API with a `.p8` key. `SUBMISSION.md` independently reached
the same conclusion — the API path handles screenshot ordering deterministically
where the browser path cannot. Use it for metadata, screenshots, build attach,
and submit. Creating the app record, Agreements/Tax/Banking, App Privacy labels,
the IDFA questionnaire, and minting the first `.p8` remain hand-clicked.

Pushing to `main` builds and uploads a draft AAB to Play, and auto-deploys the
backend to prod when the diff matches the `deploy-backend.yml` path filter. Per
`CLAUDE.md`, say which of these a given push will fire.
