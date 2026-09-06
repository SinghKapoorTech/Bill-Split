# iOS verification checklist (run on the Mac)

Commit `5aa1a6f` changed three things under `ios/` that **could not be verified on
Windows**: no Xcode, no CocoaPods, no simulator. The web and backend gates all
passed and are deployed, but nothing below has ever been compiled or run.

Work top to bottom. **Step 4 is the one that matters most** — a mistake in this
area already broke receipt scanning once during development and was only caught
by code review, not by any automated gate.

Nothing here is deployed to users yet: iOS ships manually from Xcode, so `ios/`
changes sit inert in the repo until you build them.

```bash
git pull
cd ios/App && pod install && cd ../..
```

---

## 1. The Xcode project still opens

**Why:** `project.pbxproj` was edited by hand (a Python script, not Xcode) to add
`PrivacyInfo.xcprivacy` to the App target. Four insertions across `PBXBuildFile`,
`PBXFileReference`, `PBXGroup` and `PBXResourcesBuildPhase`. Structure was
verified (UUID counts, balanced braces) but never opened by Xcode.

```bash
open ios/App/App.xcworkspace
```

- [ ] The project loads with no "damaged / cannot be read" error
- [ ] The navigator shows **PrivacyInfo.xcprivacy** inside the `App` group,
      alongside `Info.plist` and `GoogleService-Info.plist`

**If it fails:** `git revert 3741fd3` restores the previous project file. The
manifest can then be re-added through Xcode's own UI (drag into the `App` group,
tick the **App** target) — the file content itself is fine, only the wiring is
in question.

## 2. Target membership is actually set

**Why:** a privacy manifest that is not in **Copy Bundle Resources** never enters
the `.app` and silently does nothing. This is the whole point of the change.

In Xcode: select `PrivacyInfo.xcprivacy` → File Inspector (⌥⌘1) → **Target
Membership**.

- [ ] **App** is ticked
- [ ] Build Phases → Copy Bundle Resources lists `PrivacyInfo.xcprivacy`

## 3. Pod privacy manifest inventory

**Why:** this could not be run without CocoaPods. Firebase 11.7.0 and
GoogleSignIn 7.1.0 are confirmed to ship their own manifests, but four transitive
pods were never checked.

```bash
find ios/App/Pods -iname '*.xcprivacy'
```

- [ ] `FirebaseAuth`, `FirebaseCore`, `FirebaseCoreInternal`, `GoogleUtilities`
      and `GoogleSignIn` all appear
- [ ] Note whether `AppAuth`, `GTMAppAuth`, `GTMSessionFetcher` and
      `RecaptchaInterop` appear

`GTMSessionFetcher` is the one worth attention — it plausibly touches
`UserDefaults` or file-timestamp APIs. If it has no manifest, that is not
necessarily a problem (Apple only emails about it if the scanner finds a
required-reason symbol), but it is the likeliest source of an `ITMS-91053` email
after upload.

## 4. 🔴 Receipt scanning still works on a device

**Why this is the critical one:** `NSPhotoLibraryAddUsageDescription` was removed
during development on the reasoning that the app never writes to the photo
library — which is true, and which would have broken the app completely.

`@capacitor/camera` validates **all three** usage-description keys on every
`getPhoto()` call, regardless of `saveToGallery`:

```swift
// node_modules/@capacitor/camera/ios/Sources/CameraPlugin/CameraPlugin.swift:160
if let missingUsageDescription = checkUsageDescriptions() {
    call.reject(missingUsageDescription); return   // before the picker ever opens
}
// CameraTypes.swift:63 — allCases includes photoLibraryAddUsage
```

and `useImagePicker.ts:39` swallows the rejection into `return null`. The failure
mode is **completely silent**: tap "scan receipt", nothing happens, no error.

The key was restored before commit, so this should work — but it is unproven on
hardware, and no test on any machine can catch it.

Run on a **real device** (the simulator has no camera):

- [ ] Tap to add a receipt → the camera/photo sheet **appears**
- [ ] Choose **Take Photo** → capture → items and prices come back
- [ ] Choose **Photo Library** → pick an existing image → items come back
- [ ] Xcode console shows no `You are missing NS...UsageDescription` message

**If the sheet does not appear**, check `ios/App/App/Info.plist` still contains
all three of `NSCameraUsageDescription`, `NSPhotoLibraryUsageDescription`,
`NSPhotoLibraryAddUsageDescription`. Do not remove any of them, whatever a
privacy review suggests — there is a comment in the file explaining why.

## 5. The manifest is in the built app

**Why:** confirms steps 1–2 actually took effect in a real build, rather than
just looking right in the UI.

Build for a device, then:

```bash
# adjust the DerivedData path to match your build
find ~/Library/Developer/Xcode/DerivedData/App-*/Build/Products \
  -name 'PrivacyInfo.xcprivacy' -path '*App.app*'

plutil -lint ios/App/App/PrivacyInfo.xcprivacy
```

- [ ] `PrivacyInfo.xcprivacy` is found at the **root of `App.app`**
- [ ] `plutil -lint` reports `OK`

The manifest declares 9 collected data types and one required-reason API
(`NSPrivacyAccessedAPICategoryFileTimestamp` / `C617.1`, for
`@capacitor/filesystem`, which ships no manifest of its own at any version).

## 6. Archive and upload

- [ ] Product → Archive succeeds
- [ ] Upload to App Store Connect succeeds
- [ ] **Watch the email.** `ITMS-91053` (missing API declaration) or `ITMS-91056`
      (invalid privacy manifest) arrive by email *after* a successful upload —
      the upload passing is not proof the manifest is right. If one arrives, note
      which category it names; that identifies the pod still missing a manifest.

---

## Manual steps in App Store Connect (not fixable from the repo)

- [ ] **Support URL** — still set to the old `https://bill-split-lemon.vercel.app`,
      which now returns **404**. Change it to `https://www.divit-bill.com/contact`
      (live and returning 200). Editing the repo does **not** update Apple.
- [ ] **App Privacy labels** — still unfilled. Fill them from
      `ios/App/App/PrivacyInfo.xcprivacy`, which is now the source of truth:
      Name, Email Address, Phone Number, User ID, Other User Contact Info,
      Photos or Videos, Other Financial Info, Customer Support, Product
      Interaction. All linked to the user, none used for tracking.
- [ ] **Play Data Safety** — must match the same nine.
- [ ] **Age rating** questionnaire and **App Review Information** (demo account).

## Still-open blockers (not addressed by this commit)

These will fail review independently of anything above:

1. **No in-app account deletion** — Apple 5.1.1(v). Nothing exists in `src/` or
   `functions/src/`.
2. **Google-only sign-in** — Apple 4.8 requires a privacy-preserving alternative.
   Also the reviewer-access path: Google blocks sign-in from unfamiliar
   locations, which returns as "unable to sign in".
3. **Venmo hand-off** — `openVenmoApp` tries the `venmo://` scheme first and
   falls back after 2500ms; on a review device without Venmo installed that
   surfaces an error before the fallback fires. Prefer the universal link on iOS.
4. **Unverified `divit://` deep link** — no `apple-app-site-association`, no
   entitlements file, so the scheme is unverified.

## Known data-handling issues (disclosed in the policy, not yet fixed)

Found during the privacy audit and now described in `PrivacyPolicy.tsx`.
Disclosure is not a fix:

- Placeholder `users/` records are created for people who never signed up,
  holding their name, email, phone and Venmo handle. They cannot see or delete
  them (`userService.ts:308`).
- `firestore.rules:22` — `allow get: if request.auth != null` lets any signed-in
  user read any profile, including email, phone and Venmo handle. The rules file
  documents this as a known limitation.
- Firebase Analytics is initialised unconditionally with no consent gate and no
  in-app opt-out (`firebase.ts:40`).
- `deleteRecurringBill` sets `status: 'completed'` rather than deleting
  (`recurringBillService.ts:218`).

The first two share a root cause with the missing account-deletion flow and are
best tackled as one workstream.
