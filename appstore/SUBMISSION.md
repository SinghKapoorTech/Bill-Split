# App Store Connect submission — process notes

Operational notes for submitting **Divit** (`com.singhkapoortech.divit`, ASC app
`6760331853`). Copy for the listing itself lives in `listing.md`; this file is about
*how the submission works* and what bites. Last verified 2026-09-05 against ASC.

## State (iOS 1.0, inflight — updated 2026-09-06)

Filled and saved — verified after a full page reload:

- Promotional Text, Description, Keywords, Support URL, Marketing URL, Copyright
- iPhone screenshots: 9 in the **6.9″** slot, order 01→09
- iPad screenshots: 6 in the **13″** slot, order 01→06
- Release: **Manually release this version**

**Not submitted.** Still outstanding:

- ~~**Build**~~ — **build 176 (version 1.0) was delivered successfully** and is
  available to attach. Note it did NOT come from this repo's
  `CURRENT_PROJECT_VERSION`, which is still `1`; build numbers are being set
  somewhere else (Xcode Cloud via `ios/App/ci_scripts/ci_post_clone.sh`, or by
  hand). Find out which before the next upload, or you will collide.

  Delivery raised **ITMS-90068** (warning, not a rejection — the build is still
  submittable): `MinimumOSVersion` 14.0 is below the 15.0 that App Store Connect
  will require from Spring 2027. Fixed on 2026-09-06 by raising
  `IPHONEOS_DEPLOYMENT_TARGET` to 15.0. iOS 14 support was already fictional —
  `ios/App/Podfile` has declared `platform :ios, '15.0'` for some time, so every
  pod was already built against 15.0 while the app target alone claimed 14.0.
  The fix applies to the NEXT upload; it does not invalidate build 176.
- **App Review Information** — demo account. No longer blocked: Sign in with Apple
  shipped 2026-09-06, so a reviewer has a sign-in path that Google cannot
  geo-block. Still needs filling in.
- **App Privacy** labels and **age rating** questionnaire — separate sections. The
  labels must match `ios/App/App/PrivacyInfo.xcprivacy` and
  `src/pages/PrivacyPolicy.tsx`; reviewers compare them.
- ~~**Guideline 4.8 risk**~~ — **closed 2026-09-06.** Sign in with Apple shipped in
  `c144ad2`; see the section below. `appstore/listing.md` was updated to match in
  `e205fac`, so the listing no longer contradicts the binary.
- ~~**Associated Domains capability**~~ — **enabled and verified 2026-09-06.** But
  it invalidated every provisioning profile on the App ID: refresh Xcode Cloud /
  manual profiles before the next archive. See the section below.
- **iOS stays on 1.0; Android is on 1.3. That drift is accepted, not a defect.**
  iOS 1.0 genuinely is the first iOS release. `MARKETING_VERSION` was briefly
  aligned to 1.3 on 2026-09-06 and reverted the same day once build 176 turned
  out to be already delivered as 1.0 — changing it would have discarded that
  build and forced an ASC version edit for no benefit. Realign at a natural
  bump, not mid-submission.

## Gate status — 2026-09-06, second run: ALL TEN ROWS CLEAR

Re-ran `/store-submission` end to end after Sign in with Apple, in-app account
deletion (`c144ad2`) and the Associated Domains work landed. Every row was
re-executed from its verification command, not carried over.

| # | Row | Status |
| --- | --- | --- |
| 1 | Account deletion | clear — `DeleteAccountCard` rendered in `SettingsView` (Profile tab) |
| 2 | Sign in with Apple | clear — `providers: ["google.com","apple.com"]`, `shouldOfferApple` gates to iOS |
| 3 | Privacy manifest | clear |
| 4 | Venmo ordering | clear — scheme-first, see the skill's §4 before touching |
| 5 | Deep links / universal links | clear — entitlement + capability + live AASA |
| 6 | Gemini disclosure | clear in code and policy; **ASC labels still outstanding** |
| 7 | Android backup | clear |
| 8 | Play target API | clear — 36 |
| 9 | Version drift | accepted (iOS 1.0 / Android 1.3), not a defect |
| 10 | Support URL | clear |

Guideline pass: 5.1.1(i) satisfied (four in-app `/privacy` links). The
listing-vs-binary contradiction is gone — `listing.md` no longer claims
Google-only sign-in.

Gates: **349 tests / 24 files pass**, typecheck **36** (exactly the CI ratchet),
lint **71** (baseline). Unchanged by any of this work.

### What "all rows clear" does NOT mean

The gate reads the repo. Three things it cannot see can still sink the
submission, and none is verified:

1. **The Firebase Apple provider is unverified.** `AuthContext` throws
   *"Sign in with Apple returned no nonce. Check that the Apple provider is
   enabled in the Firebase console."* That provider needs the Services ID, Team
   ID, Key ID and the `.p8` configured server-side — none of it in this repo. If
   it is not set up, Apple sign-in fails at runtime and the reviewer is blocked
   on the exact path 4.8 required. **Do a real Apple sign-in on a device before
   submitting.**
2. **Provisioning profiles were invalidated** by enabling Associated Domains.
   Automatic signing recovers on the next build; Xcode Cloud and manual profiles
   must be refreshed first.
3. **Universal links are unconfirmed on a device.** Test with a FRESH INSTALL —
   iOS caches AASA results.

Plus the hand-clicked ASC work, none of which the gate can check: App Privacy
labels (must match `PrivacyInfo.xcprivacy` and `PrivacyPolicy.tsx`), age rating,
IDFA questionnaire, the demo-credential question in `listing.md`, attaching a
build, and the build-number mismatch (176 vs `CURRENT_PROJECT_VERSION = 1`).

## Compliance gate run — 2026-09-06 (first run): what it changed

`/store-submission` run against the blocking gate table, plus the `app-store-review`
guideline pass. Account deletion (row 1) and Sign in with Apple (row 2) are owned
by a separate workstream and were NOT touched here.

**Fixed and verified (`npm test` 309 pass, typecheck 36 = ratchet, lint 71 =
baseline, `npm run build` clean):**

- **Deep links were broken, not just unverified.** `DeepLinkHandler` navigated to
  `url.pathname + url.search`, but for a custom scheme the first segment parses as
  the *authority* — `divit://join/abc?code=X` became `/abc?code=X` and every native
  share link opened on the NotFound route. Extracted to `src/utils/deepLink.ts`
  with regression tests. The https form always parsed correctly, which is why this
  never reproduced on web.
- **In-app privacy policy (Guideline 5.1.1(i)).** `/privacy` and `/contact` existed
  but the only link to either was in `LandingFooter`, and `RootRoute` never renders
  `LandingPage` on native — so neither was reachable on device. Links added to
  `SettingsView` and `MobileAuth`.
- **Android backup of financial data.** `allowBackup` true → false, plus
  `res/xml/data_extraction_rules.xml` for device-to-device transfer (which
  `allowBackup` does not govern on API 31+). Cost: a restored user re-signs in;
  an anonymous guest loses `localStorage["guest-id-*"]` identity permanently.
- **Play target API.** The Aug 31 2026 deadline has passed — new apps *and updates*
  must target API 36. `targetSdkVersion`/`compileSdkVersion` 35 → 36, which forced
  AGP 8.7.2 → 8.10.1 (8.9 is the floor for compileSdk 36; 8.11+ would also force a
  Gradle wrapper bump, and the wrapper is exactly at AGP 8.10's 8.11.1 minimum).

**Universal links — code-complete (the portal step was done later the same day):**

- `public/.well-known/apple-app-site-association` is **live in production**:
  `200 application/json`, claiming `3LAJCPKLNV.com.singhkapoortech.divit` for
  `/join/*`. The `vercel.json` rewrite exclusion and content-type header work —
  confirmed against the deployed site, and no SPA route regressed.
- The `com.apple.developer.associated-domains` entitlement was added 2026-09-06,
  and the capability was enabled on the App ID the same day. See "Associated
  Domains" below — it remains unconfirmed on a device.

**Deliberately NOT changed, and why:**

- **The Venmo hand-off ordering (gate row 4) is correct as-is.** The gate file's
  guidance to prefer the universal link on iOS is **wrong** and was reverted after
  an adversarial review caught it. Verified against Venmo's live servers on
  2026-09-06: `account.venmo.com` claims only `/go/checkout/wallet-network` and
  `/go/web/paypal` in its AASA, so `https://account.venmo.com/pay` is **not** a
  universal link and iOS will never hand it to the Venmo app — and it 307s to
  `venmo.com/account/sign-in`. Universal-link-first would drop every iOS user on a
  web sign-in page. The "Cannot Open Page" dialog the gate worries about is
  mobile-Safari behaviour; inside Capacitor the navigation goes to
  `UIApplication.open`, which fails silently. App Review runs the binary, not the
  website. The reasoning is recorded in `src/utils/venmo.ts` and pinned by tests.

**Open / unverified:**

- ~~The Android build was never compiled.~~ **Verified 2026-09-06** — run
  [34020572259](https://github.com/SinghKapoorTech/Bill-Split/actions/runs/34020572259)
  on `verify/android-api36`, build-only, no Play upload. `bundleRelease`
  succeeded with AGP 8.10.1 / compileSdk 36 / targetSdk 36 on JDK 21, and the
  merged manifest carries `android:allowBackup="false"` and
  `android:dataExtractionRules="@xml/data_extraction_rules"`.

  Verify Android toolchain changes this way rather than by pushing: a manual
  `android.yml` run now builds only and skips Play unless `publish=true`.
  Local builds are not an option on this machine (no Android SDK; JDK 26 is
  ahead of the Gradle 8.11.1 wrapper).
- `data_extraction_rules.xml` **semantics** are still unverified. The build
  proves the manifest references it; nothing proves the rules exclude anything —
  res/xml resources are not schema-validated, so a wrong file builds green.
  `path="."` is set explicitly because the docs never say whether `path` is
  optional on `<exclude>`, and an omitted path may silently exclude nothing.
  Confirm with `adb shell bmgr` on an emulator when convenient.

  Not worth blocking a release on: the worst case is that device-to-device
  transfer still copies app data, which is exactly what `allowBackup="true"`
  already permitted. The change can under-deliver but cannot open a hole.
- Android App Links still need `.well-known/assetlinks.json`, which requires the
  release keystore SHA-256 — the keystore lives in GitHub secrets, so this has to
  be generated by whoever can run `keytool` against it.
- App Privacy labels, age rating and the IDFA questionnaire remain hand-clicked and
  must match `ios/App/App/PrivacyInfo.xcprivacy` (which is complete and correctly
  wired into the Resources build phase) and `src/pages/PrivacyPolicy.tsx`.

### Sign in with Apple — SHIPPED (2026-09-06)

All five steps are done — commit `c144ad2`, which landed Sign in with Apple and
in-app account deletion together, closing blocking gate rows 2 and 1. App ID
`com.singhkapoortech.divit` (`XLSVJ5V3B3`, team `3LAJCPKLNV`) is a primary App ID
with the capability enabled; `ios/App/App/App.entitlements` exists and is wired
via `CODE_SIGN_ENTITLEMENTS`; `AuthContext.tsx` branches on provider and
`capacitor.config.ts` lists both. Design notes:
`docs/superpowers/specs/2026-09-05-sign-in-with-apple-design.md`.

Still true and still bites: **enabling a capability invalidates every provisioning
profile on the App ID.** Xcode automatic signing regenerates on the next build;
anything on a manual profile — including Xcode Cloud via
`ios/App/ci_scripts/ci_post_clone.sh` — needs refreshing before the next archive,
or signing fails. This applies again to Associated Domains, below.

`listing.md` was updated to match in `e205fac` — it now records that 4.8 and
5.1.1(v) are satisfied, and its review notes walk a reviewer through building a
bill by hand. That matters because a fresh Sign in with Apple lands in an EMPTY
account and there is no email/password provider, so a pre-populated demo account
could only be a Google one — the fragile path Apple sign-in was meant to avoid.

Unresolved there: ticking "Sign-in required" in ASC exposes mandatory User Name
and Password fields that an OAuth-only app cannot fill. Settle whether ASC
accepts them blank with a note before starting the submission.

### Associated Domains — DONE (2026-09-06)

`App.entitlements` carries:

```xml
<key>com.apple.developer.associated-domains</key>
<array><string>applinks:www.divit-bill.com</string></array>
```

and the **Associated Domains capability is enabled on App ID `XLSVJ5V3B3`**.
Verified by reloading the edit page and reading the checkbox back — not by the
save banner, which on this page has appeared to succeed without sticking before:

```
associatedDomains : true    (was false)
mdmManaged        : false   (untouched — different feature, leave it off)
signInWithApple   : true    (untouched)
```

`www` **only**. `divit-bill.com` 307s to `www` and Apple's AASA fetcher does not
follow redirects, so listing the apex silently fails validation.

Both ends were checked against each other: the entitlement names
`www.divit-bill.com`; that host serves `/.well-known/apple-app-site-association`
as `200 application/json` claiming `3LAJCPKLNV.com.singhkapoortech.divit` for
`/join/*`; and `/join/:sessionId` is a real route in `src/App.tsx`.

⚠️ **Enabling the capability invalidated every provisioning profile on this App
ID** — the same thing Sign In with Apple did. Xcode automatic signing regenerates
on the next build; Xcode Cloud and any manual profile must be refreshed first
(`ios/App/ci_scripts/ci_post_clone.sh`), or signing fails there while local builds
pass.

**Not yet confirmed on a device.** Test with a FRESH INSTALL of a build made after
this change: iOS caches AASA results, so a link tapped before the new build is
installed keeps opening Safari and reads as broken when it is not.

#### Two traps hit while enabling it

- **Save is not enough.** Clicking Save opens a confirmation modal (the
  profile-invalidation warning). Left unconfirmed, nothing is applied even though
  the click "succeeded". Always confirm, then reload and read the value back.
- **Apple reuses the id `ASSOCIATED_DOMAINS`** on both the `<input>` and an
  `<svg>` icon, so `#ASSOCIATED_DOMAINS` is ambiguous and throws a strict-mode
  violation. Scope selectors to `input[type=checkbox]#ASSOCIATED_DOMAINS`.

## Screenshot slots — the part that wastes time

Sizes are **not** interchangeable, and the UI actively misleads:

- The inline "Previews and Screenshots" section on the version page shows only the
  **6.5″** slot (`1242 × 2688` etc.). Our renders are `1320 × 2868`, which is **6.9″**.
  Dropping them there fails with *"The dimensions of one or more screenshots are wrong."*
- The other sizes live in **Media Manager**:
  - `…/version/inflight/media-manager/iphone`
  - `…/version/inflight/media-manager/ipad`
- Apple scales the 6.9″ set down to smaller iPhone classes, so 6.5″ can stay empty.
- iPad screenshots are **required** — the app is universal (`TARGETED_DEVICE_FAMILY = "1,2"`).
  13″ iPad wants `2064 × 2752`; `appstore/out-ipad` already matches.

### Two mechanics that are easy to get wrong

**There is one shared `<input type=file>` per media-manager page.** Which slot receives
the upload is decided by **which accordion is expanded**, not by which button you click.
Expand the target size first, then upload. This is what causes "I uploaded to 6.9″ but it
rejected them as 6.5″."

**Upload one file at a time.** Sending all nine at once makes them land in *completion*
order, not filename order — we got `03,02,01,06,07,05,08,09,04`. Sequential uploads with
a pause between each preserve order. Order matters: only the first three appear on the
app installation sheet, so `listing.md` sequences them scan → fair split → settle.

Screenshot tiles are drag-reorderable by a human, but **synthetic drags do not reorder
them** — Apple uses a custom drag implementation. To fix a bad order, delete and
re-upload sequentially rather than trying to drag.

Deleting: per-tile Delete buttons are hover-revealed, so normal clicks time out. Use a
direct DOM click, and match the name exactly — `"Delete"` as a prefix also matches the
usually-disabled `"Delete All"`.

## Doing this by hand vs. automating it

The version page automates cleanly — it is well-labelled and renders as ~17KB of clean
accessibility tree. See `docs/browser-automation.md` for the setup.

But for a *repeatable release pipeline*, the better answer is the **App Store Connect API**
(JWT with a `.p8` key) plus **`fastlane deliver`**, roughly 2–4 hours to set up. It covers
metadata localizations, screenshots (reserve → upload → commit), build attach, and
submit-for-review — and it handles screenshot ordering deterministically, which the browser
path cannot. Metadata becomes files in the repo you review as a diff before anything
reaches Apple.

Genuinely web-only, no API equivalent — expect to click these by hand:

- Creating the app record (Apple's own docs say don't use the API for this)
- Agreements, Tax, and Banking
- App Privacy labels and the IDFA questionnaire
- Minting the first `.p8` key

Caveats worth knowing if you automate:

- ASC is a **micro-frontend** — sections are separately built and versioned, so older
  sub-apps (the `/agreements` area still runs AngularJS 1.8.2 with almost no ARIA and no
  test hooks) are far more hostile to automation than the modern React screens. Breakage
  arrives piecemeal rather than at one visible redesign.
- The login is defended by a hashcash proof-of-work challenge; **nobody automates the
  Apple ID login**. Every maintained tool opens a headed browser and hands the keyboard to
  a human for 2FA. Web sessions are short-lived; API keys don't expire that way.
- Wrong-sized screenshots pushed via the API fail **asynchronously and terminally**
  (`assetDeliveryState: FAILED`) — they need delete-and-re-upload, not a retry.

## Next release checklist

1. Update copy in `listing.md`
2. Regenerate screenshots (`appstore/capture.sh` → `render.mjs`); confirm 1320×2868 / 2064×2752
3. Upload the build from Xcode, wait for it to finish processing
4. Attach build → App Review info → App Privacy → age rating
5. Submit
