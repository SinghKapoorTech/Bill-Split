# Paid launch — master plan (owner + AI)

**Status:** NOT STARTED (planning complete 2026-10-10)
**Workspace:** /Users/simran/Documents/GitHub/Bill-Split
**Updated:** 2026-10-10 (rev 2: tooling and automation added)

This is the **sequencing plan**: who does what, with which tool, in what order, and what blocks
what. The **technical detail** for each AI coding task stays in
`docs/superpowers/plans/2026-09-09-free-and-paid-tier-launch.md` (cited as "TP §x").
Paywall model: the owner's 2026-10-10 decision "option C" (recorded in TP under
"Decision 2026-10-10"). Pricing research: `reports/Bill splitting app pricing model.md`.

Step ids: **Y** = you (owner), **A** = AI (Claude, from this repo). `⛔ Y-n` = blocked until
that owner step is done. **🔑** = a one-time grant from you that lets the AI do a whole class of
work by itself afterwards.

> Not legal, tax or accounting advice. LLC rules and fees vary by state. Use the steps below as a
> checklist and confirm with your state's Secretary of State site or an accountant.

---

## Working rules (apply to every step)

- **One task at a time.** Finish, verify and hand back one step before starting the next. Never
  run several plan steps in one go.
- **Small tasks.** If a step is more than one focused change, split it into sub-steps
  (e.g. A-13a, A-13b) before starting, and do them one by one.
- **One change request (CR) = one small thing.** Each commit/push covers exactly one focused
  change: one feature slice, one fix, or one config change. No bundled unrelated edits and no
  drive-by refactors. Unrelated findings become a new step, not part of the current CR.
- **Each CR ships on its own** through the normal flow: gates → review → your verification → commit and push.

## ★ Start here — your next steps (owner)

In order. Everything not listed is the AI's (§4). Details for each are in the referenced step.

1. **Answer D1–D4 (§2).** "Defaults" accepts all of them: LLC in parallel (sign the stores as an
   individual for now); LLC in your home state (**tell the AI which state**); free scans 2 → 5, only
   owned unsettled events count toward the cap, Trip Pass and lifetime later; $4.99/mo, $34.99/yr,
   14-day trial on annual only.
2. **Log in once in Chrome (Y-23 / G3)** to App Store Connect, Play Console, RevenueCat and the
   Firebase console.
3. **Store agreements (Y-11, Y-12, Y-20)**, with the AI walking you through in Chrome. You type the
   bank and tax fields and click accept:
   - Apple Paid Applications agreement + bank + W-9 (separate personal checking account for now).
   - Apple Small Business Program (15%).
   - Google Play payments profile.
4. **Two Apple keys (Y-15 / G1):** App Store Connect API key (App Manager) + In-App Purchase key.
   Save the `.p8` files to `~/.appstoreconnect/private_keys/`; send the AI the key IDs + Issuer ID only.
5. **LLC (Y-1…Y-7):** the AI does the name/trademark search and drafts the operating agreement.
   You file the Articles and pay the fee this week. Once approved: EIN → business bank → D-U-N-S.
6. **Play testers (Y-24):** the AI first checks in Chrome whether production access needs the
   12-tester / 14-day closed test. If it does, send the invite text the AI writes to 12 people.
7. **Phase 3 QA on beta (Y-26):** `npm run dev:beta`; on a fresh account a 3rd group must be refused.

**Later, as they come up:** test purchases on your iPhone and Android phone (Y-27); approve
listing copy (Y-29); switch both stores to the LLC once the D-U-N-S arrives (Y-31, Y-32);
Submit (Y-33); say "go" for the prod paywall (Y-34).

---

## 0. Where we are (verified 2026-10-10)

| Area                                                                                   | State                                                                                     |
| -------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Server: caps, entitlements, RevenueCat webhook                                         | ✅ Live in prod. `REVENUECAT_WEBHOOK_SECRET` exists in prod **and** beta (Secret Manager) |
| Client: entitlement/quota/cap hooks, scan wall, group wall, `/upgrade` (static prices) | ✅ Shipped                                                                                |
| Settings → Plan card (TP 3.3)                                                          | ❌ Not built                                                                              |
| Phase 3 owner QA on beta                                                               | ❌ Not done                                                                               |
| Kill switch `paywall_enabled`                                                          | beta **true**, prod **false**                                                             |
| RevenueCat project `projaca9e24b` "Divit: Bill Splitter"                               | Exists; only the default Test Store app. **0 products, 0 offerings**, no iOS/Android app  |
| RevenueCat SDK keys in `.env` / CI                                                     | ❌ None                                                                                   |
| Purchase SDK in the app (TP Phase 4)                                                   | ❌ Not started                                                                            |
| Apple Paid Applications agreement / Play payments profile                              | ❓ Assumed **not signed** (Oct 8 handoff)                                                 |
| Store subscription products                                                            | ❌ None (RevenueCat sees none)                                                            |
| App Store Connect API key on this machine                                              | ❌ None (no `~/.appstoreconnect`, no `.p8`)                                               |
| Legal entity                                                                           | Individual. **Owner wants an LLC + business bank account**                                |

---

## 1. Tools — what's here, what it automates, what's been proven

| Tool                                                                                                                                          | On this machine                            | Signed in as / auth                                | What the AI can automate with it                                                                                                                                                                                                                                                  | Proven before?                                                                                                       |
| --------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ | -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| **RevenueCat MCP** (`mcp__revenuecat__*`)                                                                                                     | ✅ (user scope)                            | secret key for `projaca9e24b`                      | Create iOS/Android apps, entitlements, offerings and packages, webhooks. **Create the subscriptions, prices and free trials directly in App Store Connect and Google Play** ("product store state plans"). Submit App Store products for review, read customers and subscriptions | ✅ Connected; `list-*` used 2026-10-10. Store-product creation **not yet tried** (needs store credentials first)     |
| **Claude in Chrome** (extension in your Chrome; `mcp__claude-in-chrome__*`) — **preferred browser path** | ✅ Chrome installed; extension **connected** as "Browser 1" (macOS, verified 2026-10-10) | your logged-in Chrome sessions | Same console work as below, in your everyday Chrome: App Store Connect, Play Console, RevenueCat and Firebase dashboards, forms, file uploads (`file_upload`), GIF recordings of what was done | Connected; console work **not yet run** with it. A second, Windows browser is also connected: the AI must stay on Browser 1 |
| **Browser control** (Playwright MCP over CDP, your logged-in Opera automation profile; `docs/browser-automation.md`, `browser-control` skill) | ✅                                         | your sessions (you log in, AI drives)              | Anything in a web console with no API: App Store Connect forms, App Privacy labels, Play Console pages, uploading key files to the RevenueCat dashboard, Firebase console. Can attach files                                                                                       | ✅ **Filled the ASC listing + 15 screenshots** (2026-09-05). Play Console and RevenueCat dashboard **not yet tried** |
| **`gh`**                                                                                                                                      | ✅                                         | `amaninderpreetsingh` (repo, workflow)             | GitHub Actions secrets (`gh secret set`), trigger/watch workflows                                                                                                                                                                                                                 | ✅ Used throughout                                                                                                   |
| **`firebase`** CLI + Firebase MCP                                                                                                             | ✅                                         | `singhkapoortech@gmail.com`                        | Deploy functions/rules, read logs, Firestore reads, Remote Config via `npm run rc:publish`                                                                                                                                                                                        | ✅ Used throughout                                                                                                   |
| **`gcloud`**                                                                                                                                  | ✅                                         | `singhkapoortech@gmail.com`, project `divit-6d217` | Secret Manager, IAM, **create service accounts + keys**, log-based metrics/alerts, Identity Toolkit config (e.g. auth providers)                                                                                                                                                  | ✅ Used 2026-10-09/10                                                                                                |
| **GitHub Actions `android.yml`**                                                                                                              | ✅                                         | `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON` secret          | Builds the AAB and uploads it to Play **`internal`** track as **draft** on every push to `main`. Changing `track:` to `alpha` makes it serve a closed test                                                                                                                        | ✅ Every push                                                                                                        |
| **Xcode Cloud** (`ios/App/ci_scripts/ci_post_clone.sh`)                                                                                       | ✅                                         | Apple account                                      | iOS builds → TestFlight                                                                                                                                                                                                                                                           | ✅ Build 176 delivered                                                                                               |
| `xcodebuild` / `xcrun altool`                                                                                                                 | ✅                                         | needs an ASC API key                               | Local archive + upload as a fallback to Xcode Cloud                                                                                                                                                                                                                               | Not used                                                                                                             |
| **fastlane**                                                                                                                                  | ❌ not installed (`brew install fastlane`) | needs ASC API key / Play SA                        | Scriptable store metadata, screenshots, TestFlight, Play listings                                                                                                                                                                                                                 | Optional; RevenueCat MCP + browser control already cover the gaps                                                    |
| **Still yours, even with full access** | — | — | See §1b | — |

### 🔑 One-time grants that unlock the AI

| Grant (you do once)                                                                                                                                                                                                                                                                                | Then the AI can do by itself                                                                                                                                                                     |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **G1. App Store Connect API key** (Team key, role _App Manager_ or _Admin_) + **In-App Purchase key**. Put the `.p8` files in a local folder (e.g. `~/.appstoreconnect/private_keys/`, outside the repo) and send me the Key IDs + Issuer ID. Don't paste keys into chat                           | Connect the iOS app in RevenueCat. **Create `divit_pro_monthly` / `divit_pro_annual` in App Store Connect with prices and the 14-day trial**. Later: TestFlight/metadata via API or fastlane     |
| **G2. Google Play API access** for RevenueCat: a service account with _View financial data_ + _Manage orders and subscriptions_. **The AI creates the service account and key with `gcloud`**; you (or browser control, with you watching) grant it access in Play Console → Users and permissions | Connect the Android app in RevenueCat. **Create `divit_pro` (monthly + annual base plans, 14-day trial on annual) in Play**                                                                      |
| **G3. Browser session.** In **Chrome (Claude in Chrome extension)** — or the Opera automation profile as a fallback — log in once to App Store Connect, Play Console, RevenueCat and Firebase                                                                                                            | Upload G1/G2 key files into the RevenueCat dashboard, Play real-time notifications setup, App Privacy labels, Data safety form, license testers, closed-test tester list, App Check registration |
| **G4. "Go" for outward-facing writes.** A standing OK, or per step, for: writing GitHub secrets, creating store products at the agreed prices, submitting products for review                                                                                                                      | The AI does them, and shows you the exact change first                                                                                                                                           |

---

### 1b. "Full access" (owner, 2026-10-10): what it changes and what stays yours

You've offered the AI full access. With Claude in Chrome plus the CLIs above, the AI can do
**nearly all console and setup work end to end**: App Store Connect, Play Console, RevenueCat,
Firebase/GCP, GitHub. It fills every form up to the final click. These stay yours **regardless of
access**, because they are legal attestations, identity, money, or rules the AI must follow:

| Stays with you | Why | How we split it |
|---|---|---|
| **Signing / accepting legal agreements** (Apple Paid Applications agreement, Play developer terms, LLC Articles, operating agreement, EIN application) | Binding contracts and attestations made by you as a person | AI fills everything and stops on the page; you read it and click accept/sign |
| **Typing identity, tax and bank details** (SSN/EIN, bank routing/account numbers, W-9, ID/KYC selfies) | The AI never enters financial account numbers, government IDs or passwords into forms, even with permission | AI navigates to the field; you type those fields |
| **Passwords and 2FA** | Same rule; your sessions stay yours | You log in once per site in Chrome; the AI works inside the session |
| **Paying** (state filing fee, registered agent, any purchase) | Payments need your explicit OK per transaction | AI gets to the checkout and shows you the amount; you confirm |
| **Irreversible / public clicks** (submit for review, publish, prod paywall flip, pushing to `main`, deleting) | Per-action confirmation, always | AI asks in chat with the exact change; you reply "yes" |
| **Physical-device testing** (sandbox purchases on a real iPhone/Android) | Needs your phones and sandbox accounts | AI prepares the builds and the checklist |
| **Recruiting 12 Play testers** | Real people | AI writes the invite text and adds their emails to the test |

So most "Y" steps below become: **AI prepares → you sign / type the sensitive fields / confirm.**


## 2a. Decisions — ANSWERED 2026-10-10 (owner)

- **D1 → (b) parallel.** Sign the store agreements as an individual now with a separate checking
  account; form the LLC in parallel; switch both stores to the LLC before the first real sale.
- **D2 → home state.** ⚠ The state itself has not been named yet; the AI needs it for A-LLC.
- **D3 → keep 2 free AI scans/month for now** (no change to Remote Config; A-10 dropped).
  **New requirement: make the free plan obvious to free users**, i.e. clearly show "Free plan" and
  how many scans are left wherever it matters (new step **A-1b**, after A-1).
  Owned-only event cap, Trip Pass and lifetime were not discussed: **defaults assumed** (owned-only
  cap yes, A-6; Trip Pass and lifetime later). Change if wrong.
- **D4 → approved:** $4.99/mo, $34.99/yr, 14-day free trial on annual only.

## 2. Decisions only you can make (first — they shape everything)

- [ ] **D1. LLC timing.** You can't test in-app purchases (even in sandbox) until the store
      agreements are active, and those need your legal identity, bank and tax info.
  - (a) **LLC first.** Clean, but purchase testing waits roughly 3–6 weeks.
  - (b) **Parallel — recommended.** Sign the store agreements now as an individual, with a
    _separate_ personal checking account. Form the LLC at the same time, then switch both stores
    to the LLC **before the first real sale** (Y-30).
- [ ] **D2. LLC state.** Default: **your home state**. Delaware/Wyoming add a second registration
      in your home state with no benefit for a one-person app. California: budget the **$800/yr minimum
      franchise tax**.
- [ ] **D3. Open pricing items** (defaults in bold):
  - Free AI scans per month: **2 → 5** (or A/B 3 vs 5).
  - Group cap counts **only owned, unsettled events**: **yes**.
  - Trip Pass: **later**. Lifetime: **later**.
- [ ] **D4. Prices to create in the stores:** **$4.99/mo, $34.99/yr, 14-day trial on annual only.**
      Confirm before A-11 creates them; store prices are visible to Apple review and users.

---

## 3. Owner track (Y) — only what genuinely needs you

### 3a. LLC and banking (D1 path b: runs in parallel, blocks nothing until Y-30)

AI support for every step: name and trademark searches, a draft operating agreement from a
template, a document checklist per step, and calendar reminders. **Filing, signing and paying are yours.**

- [ ] **Y-1** Pick the legal name (e.g. "Divit LLC"). _AI can run the searches for you to review:_
      your state's business-name database and USPTO trademark search (tmsearch.uspto.gov) for "Divit".
- [ ] **Y-2** File **Articles of Organization** on your Secretary of State site (roughly $50–$500 by state).
      Name a registered agent: yourself at a physical address, or a service (~$50–$150/yr) to keep your home address private.
- [ ] **Y-3** Sign a single-member **operating agreement** (AI drafts from a standard template; you review and sign).
- [ ] **Y-4** Get the **EIN** at irs.gov ("Apply for an EIN online"). Free, usually instant. Do it after the state approves the LLC.
- [ ] **Y-5** Check **BOI reporting** on fincen.gov. FinCEN's March 2025 rule exempted US-formed companies; confirm it's still true.
- [ ] **Y-6** Open a **business checking account** (Mercury, Relay, or your bank). Bring the articles, EIN letter, operating agreement and ID.
- [ ] **Y-7** Get a **D-U-N-S number** for the LLC. It's free via Apple's D-U-N-S lookup tool; allow ~1–2 weeks.
- [ ] **Y-8** Run all app income and costs through the LLC account. Diary the annual report date.
      Find an accountant before the first tax year closes.

### 3b. Store accounts and agreements (identity + money: only you)

- [ ] **Y-10** App Store Connect → Membership: is it **Individual** or **Organization**? (AI can read it via browser control.)
- [ ] **Y-11** Apple **Paid Applications agreement** + bank + tax (W-9). As an individual now per D1(b).
- [ ] **Y-12** Enroll in the **App Store Small Business Program** (15% instead of 30%).
      **Not automatic, not backdated**: it starts the month after approval.
- [ ] **Y-20** Play Console **payments profile** (individual for now per D1(b)).
- [ ] **Y-24** Play **production access**: if this is a personal account created after Nov 2023, Google
      requires a **closed test with 12 testers for 14 days**, then an application (~7 days to review).
      **Start the clock this week.** Your part: recruit 12 testers (friends' Google accounts).
      AI part: switch CI to the closed track (A-9) and add the tester list (browser control).
      Organization accounts are reportedly exempt; verify before relying on it.

### 3c. One-time grants (§1)

- [ ] **Y-15 = G1** Create the ASC API key + IAP key; put the `.p8` files locally; send me the IDs.
- [ ] **Y-22 = G2** Approve the AI creating the RevenueCat service account; grant it Play Console permissions (or watch browser control do it).
- [ ] **Y-23 = G3** In Chrome (Claude in Chrome), log in once to App Store Connect, Play Console, RevenueCat, Firebase, and later your bank/state sites as needed. The AI never sees or types your passwords.
- [ ] **Y-25** RevenueCat dashboard → **secret API key (v2)**, read access, for the Phase 5 reconcile.
      Write it to a local file; the AI stores it with `firebase functions:secrets:set`.
- [ ] **Y-16** Create one **App Store sandbox tester** Apple ID (needs a fresh email; AI can do it via browser control).

### 3d. Testing and sign-offs (need your eyes, devices or authority)

- [ ] **Y-26** **Phase 3 QA on beta** (`npm run dev:beta`; TP "Phase 3 exit"). Key check: a fresh
      free account can't create a 3rd group.
- [ ] **Y-27** **Sandbox purchases on a real iPhone and a real Android phone** (TP "Phase 4 exit"):
      buy, Pro unlocks, Restore works, cancel reverts to free.
- [ ] **Y-29** Approve the listing, privacy-label and Data-safety copy (A-8).
- [ ] **Y-30** **Switch to the LLC before the first real sale:**
  - **Y-31** Apple Developer Support: **convert membership Individual → Organization** (D-U-N-S + legal name).
    Update bank + W-9 (EIN). The App Store seller name becomes the LLC.
  - **Y-32** Google: move the payments profile / developer account to the organization, with the LLC's bank and tax info.
- [ ] **Y-33** Final **"Submit for review"** click on both stores (AI prepares everything; the outward-facing click is yours).
- [ ] **Y-34** After approval: say **"go"** for the prod paywall flip (A-22), then do one check on a free prod account.

---

## 4. AI track (A) — with the tool for each step

**Not blocked (can start now):**

| Step      | What                                                                                                                                                                                                        | Tool                                           |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| **A-1**   | TP 3.3 **Settings → Plan card**. Restore disabled with a tooltip; Manage hidden until purchases exist                                                                                                       | code + tests                                   |
| **A-1b**  | **Free plan made obvious** (D3): a visible "Free plan · N of 2 scans left this month" status where free users see it (dashboard/header and the scan entry point), linking to `/upgrade`. Shown only when the paywall is on; never to Pro users or invitees. Exact placements proposed for owner approval first | code + tests |
| **A-2**   | Option C **day-0 Pro offer**: full-screen, dismissible, shown **once** after the first completed split. Annual + "14 days free" reminder timeline. Never shown to invitees. Pure decision logic unit-tested | code + tests                                   |
| **A-3**   | TP 4.1: `@revenuecat/purchases-capacitor` (Capacitor 7 line) + `purchaseService.ts`, with web no-op tests                                                                                                   | npm, code                                      |
| **A-4**   | TP 4.2: AuthContext → RevenueCat customer identified by Firebase uid; log out on sign-out                                                                                                                   | code + tests                                   |
| **A-5**   | TP Phase 7 analytics events (scan, cap hit, paywall viewed, purchase started/completed/failed, restore)                                                                                                     | code + tests                                   |
| **A-6**   | (D3) Group cap counts only owned, unsettled events. Failing test first + mutation check                                                                                                                     | code, `firebase deploy` via CI                 |
| **A-7**   | TP 8.1: alert on RevenueCat webhook 401s                                                                                                                                                                    | `gcloud logging metrics create` + alert policy |
| **A-8**   | Draft listing text, subscription review notes, App Privacy + Play **Data safety** updates for purchases                                                                                                     | repo docs (`appstore/`)                        |
| **A-9**   | Point `android.yml` at the **closed test track** (`track: alpha`) once Y-24 confirms it's needed                                                                                                            | workflow edit (ship flow)                      |
| **A-LLC** | Name/trademark searches, operating-agreement draft, per-state filing checklist for Y-1…Y-7                                                                                                                  | web research + docs                            |

**Unblocked by your grants:**

| Step      | What                                                                                                                                                                                                                                      | Tool                                                                | ⛔                        |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- | ------------------------- |
| **A-10**  | Free scan cap in Remote Config (beta, then prod)                                                                                                                                                                                          | `npm run rc:publish`                                                | D3                        |
| **A-11a** | Create the RevenueCat **service account + key** for Play                                                                                                                                                                                  | `gcloud iam service-accounts create` / `keys create`                | Y-22 OK                   |
| **A-11b** | Upload the ASC + IAP key files and the Play SA JSON into RevenueCat app settings; set up Play real-time developer notifications                                                                                                           | browser control (file upload)                                       | Y-15, Y-22, Y-23          |
| **A-11c** | Create iOS + Android apps in RevenueCat; `validate-app-credentials`                                                                                                                                                                       | RevenueCat MCP                                                      | A-11b                     |
| **A-11d** | **Create store products**: `divit_pro_monthly` $4.99 + `divit_pro_annual` $34.99 with a **2-week trial** (App Store), `divit_pro` monthly/annual base plans with a **14-day trial** on annual (Play). Preview the plan → show you → apply | RevenueCat MCP `create-product-store-state-plan` → `plan` → `apply` | D4, Y-11, Y-20, A-11c, G4 |
| **A-11e** | Entitlement `pro`, offering `default` (`$rc_monthly`, `$rc_annual`), webhook → prod `revenueCatWebhook` with the existing secret                                                                                                          | RevenueCat MCP                                                      | A-11d                     |
| **A-12**  | RevenueCat public SDK keys → `.env`, `.env.beta`, GitHub secrets; confirm `android.yml` passes them to the build                                                                                                                          | RevenueCat MCP `list-app-public-api-keys`, `gh secret set`          | A-11c, G4                 |
| **A-13**  | TP 4.3: `/upgrade`, Plan card and day-0 offer show **live store prices**; Purchase / Restore / Manage wired (code can be written earlier, verified only after this)                                                                       | code + tests                                                        | A-11e                     |
| **A-14**  | Test builds: Android via CI (automatic on push), iOS via Xcode Cloud                                                                                                                                                                      | push + `gh run watch`; Xcode Cloud                                  | A-12                      |
| **A-15**  | TP 4.4: read the first sandbox webhook `product_id`. If Play sends `divit_pro:monthly`, add it to `PRODUCT_PLANS` with a test                                                                                                             | `firebase functions:log`, code                                      | Y-27                      |
| **A-16**  | TP Phase 5: `reconcileEntitlement` callable + Restore wiring. Store the RevenueCat secret                                                                                                                                                 | code; `firebase functions:secrets:set`                              | deploy: Y-25              |
| **A-17**  | TP Phase 6: register App Check providers, then code in **monitor** mode, then enforce on `analyzeBill` only                                                                                                                               | browser control (Firebase console) + code                           | Y-23                      |
| **A-18**  | Fill App Privacy labels + Play Data safety + subscription review info; attach the build to the ASC version                                                                                                                                | browser control; RevenueCat MCP for review notes                    | Y-29, Y-23                |
| **A-19**  | Submit the subscriptions alongside the app version (Apple requires the **first** subscription to ship with an app version)                                                                                                                | RevenueCat MCP `submit-products-to-store` / ASC via browser         | Y-33                      |
| **A-20**  | Pre-launch gate: full suite + integration, adversarial review of the purchase path, invariant check that invitees and existing bills are never paywalled                                                                                  | tests + review agent                                                | A-13, A-16                |
| **A-22**  | Flip prod `paywall_enabled: true`, then watch webhook logs, purchases and cap errors for 48 h                                                                                                                                             | `I_MEAN_IT=1 npm run rc:publish -- prod`, `firebase functions:log`  | Y-34                      |

---

## 5. What the AI is blocked on (short list)

| Your step                              | Unblocks                                     | Why only you                                |
| -------------------------------------- | -------------------------------------------- | ------------------------------------------- |
| **D1–D4**                              | the LLC path, A-6, A-10, A-11d prices        | Decisions                                   |
| **Y-11, Y-20** (agreements)            | any purchase testing, store product creation | Legal identity, bank, tax                   |
| **Y-15 / G1** (ASC + IAP keys)         | A-11b–e on iOS, all App Store automation     | Key creation needs the Account Holder/Admin |
| **Y-22 / G2** (Play SA permissions)    | A-11b–e on Android                           | Play Console user permissions               |
| **Y-23 / G3** (browser login)          | A-11b, A-17, A-18, tester lists              | Your sessions, 2FA                          |
| **Y-24** (12 testers)                  | Android production access                    | Real people                                 |
| **Y-25** (RevenueCat secret key)       | A-16 deploy                                  | Credential                                  |
| **Y-26, Y-27** (QA, device purchases)  | Phase 3 + Phase 4 sign-off                   | Your eyes, devices                          |
| **Y-30–Y-34** (LLC switch, submit, go) | launch                                       | Legal identity + final authority            |

---

## 6. Suggested order (critical path first)

**This week**

- You: **D1–D4**; **Y-24** (start recruiting testers); **Y-2** (file the LLC); **Y-11, Y-20**
  (agreements); **Y-15, Y-22, Y-23** (the three grants — about 30 minutes in total); **Y-26** (QA on beta).
- AI: **A-1, A-2, A-3, A-4** (no blockers); **A-LLC** searches/drafts; then **A-11a → A-11e, A-12**
  as soon as the grants land.

**Next 1–2 weeks**

- You: **Y-4…Y-7** as the LLC is approved; **Y-25**; **Y-27** sandbox purchases once A-14 builds exist.
- AI: **A-13, A-14, A-5, A-7, A-8, A-9, A-15, A-16**.

**Weeks 2–4**

- You: **Y-29**; LLC switch **Y-31, Y-32** once the D-U-N-S arrives.
- AI: **A-17, A-18, A-20**.

**Launch**

- You: **Y-33** submit → approval → **Y-34** "go". AI: **A-19, A-22** + 48 h watch.

The longest waits are **Play production access** (up to ~3 weeks if required), **D-U-N-S +
Apple org conversion** (~1–3 weeks), and **app review**. Starting Y-24, Y-2, Y-7 and the grants
this week keeps them off the critical path.

---

## 7. Not in this plan (tracked elsewhere)

- **Unauthenticated guest claim:** any signed-in user who knows a guest's id can absorb their
  bills (`docs/handoffs/claim-shadow-user-settled-debt-1009.md`). Fix before marketing pushes sign-ups.
- Trip Pass, lifetime, `paywall_mode` A/B flag: Phase 9 unless D3 pulls them in.
- Organic growth (problem pages like a "rent-split calculator", slideshows): post-launch.
