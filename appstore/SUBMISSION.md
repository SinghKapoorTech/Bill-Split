# App Store Connect submission — process notes

Operational notes for submitting **Divit** (`com.singhkapoortech.divit`, ASC app
`6760331853`). Copy for the listing itself lives in `listing.md`; this file is about
*how the submission works* and what bites. Last verified 2026-09-05 against ASC.

## State as of 2026-09-05 (iOS 1.0, inflight)

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
- **App Review Information** — demo account, blocked on the sign-in decision below
- **App Privacy** labels and **age rating** questionnaire — separate sections
- **Guideline 4.8 risk** — the app offers Google Sign-In only. Apple requires a
  privacy-preserving alternative (Sign in with Apple satisfies it). This is a common
  rejection for consumer apps and is worth fixing *before* submitting.
- **iOS stays on 1.0; Android is on 1.3. That drift is accepted, not a defect.**
  iOS 1.0 genuinely is the first iOS release. `MARKETING_VERSION` was briefly
  aligned to 1.3 on 2026-09-06 and reverted the same day once build 176 turned
  out to be already delivered as 1.0 — changing it would have discarded that
  build and forced an ASC version edit for no benefit. Realign at a natural
  bump, not mid-submission.

## Compliance gate run — 2026-09-06

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

**Groundwork only — does NOT work yet:**

- `public/.well-known/apple-app-site-association` (+ a `vercel.json` rewrite
  exclusion and JSON content-type header, both verified against path-to-regexp 6).
  The file is **inert without an Associated Domains entitlement**, which does not
  exist in the project yet. See the Sign in with Apple section — same file.

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

### Sign in with Apple — progress (2026-09-05)

Step 1 of 5 is **done**. Do not redo it.

- [x] **App ID capability** — `com.singhkapoortech.divit` (`XLSVJ5V3B3`, team
      `3LAJCPKLNV`) now has Sign In with Apple enabled, **as a primary App ID**,
      server-to-server endpoint blank. Verified by reload, not by the save appearing
      to succeed. In-App Purchase and Push Notifications were left untouched.
- [ ] **Xcode entitlement** — `com.apple.developer.applesignin`. There is currently
      **no `.entitlements` file in the project at all**. Add it via Xcode's Signing &
      Capabilities UI rather than editing `project.pbxproj` by hand.

      ⚠️ **Land this SEPARATELY from the 2026-09-06 compliance changes.** Those
      edited `MARKETING_VERSION` at `project.pbxproj:368` and `:389` — inside the
      exact two `XCBuildConfiguration` blocks that gain
      `CODE_SIGN_ENTITLEMENTS = App/App.entitlements;`. Xcode rewrites the whole
      file on save, so doing both at once produces a conflict that is effectively
      unmergeable by hand. Sequence them.

      ⚠️ **Add Associated Domains to the same entitlements file while you are
      there**, or the universal-link work needs a second pbxproj round-trip:
      `com.apple.developer.associated-domains = applinks:www.divit-bill.com`.
      Use the **`www` host only** — `divit-bill.com` 307s to `www`, and Apple's
      AASA fetcher does not follow redirects, so listing the apex silently fails
      validation. Associated Domains must also be enabled on the App ID in the
      developer portal, exactly like Sign In with Apple was.
- [ ] **Sign in with Apple key** — Keys → new key bound to this primary App ID. The
      `.p8` downloads **once**; store it immediately.
- [ ] **Firebase Auth provider** — enable Apple with the Services ID, Team ID
      `3LAJCPKLNV`, Key ID and that `.p8`.
- [ ] **Client code** — `AuthContext.tsx` imports only `GoogleAuthProvider`. Native
      needs `@capacitor-firebase/authentication`'s own `signInWithApple`, not just a
      web `OAuthProvider('apple.com')`, and `capacitor.config.ts` still lists
      `providers: ["google.com"]`.

⚠️ **Enabling the capability invalidated every provisioning profile on this App ID.**
Xcode automatic signing regenerates on next build; anything on a manual profile —
including Xcode Cloud via `ios/App/ci_scripts/ci_post_clone.sh` — needs refreshing
before the next archive or signing will fail.

When Apple sign-in ships, update `listing.md` and the 4.8 note above in the same
change — both currently describe Google-only sign-in, and a listing that contradicts
the binary is its own rejection.

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
