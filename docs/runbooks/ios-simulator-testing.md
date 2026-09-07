# Runbook — testing Divit on the iOS Simulator

Everything below was learned the hard way on 2026-09-07. Nearly every item cost 10–40 minutes,
and several produced **confidently wrong conclusions** before being caught. Read the traps
before you start; most of them fail silently or, worse, look like a bug in your own code.

It's the **iOS Simulator** (Apple's term). "Emulator" is the Android equivalent — and in this
repo "emulator" almost always means the _Firebase_ emulator, which is a different thing again.

---

## The working sequence

```bash
# 1. Web assets. Pick ONE backend:
VITE_USE_EMULATORS=true VITE_FIREBASE_PROJECT_ID=demo-bill-split-test npm run build  # local emulators
npx vite build --mode beta                                                            # beta (.env.beta)

# 2. Copy them into the native project
npx cap sync ios

# 3. Build. DEVELOPMENT_TEAM IS NOT OPTIONAL — see trap 1.
xcodebuild -workspace ios/App/App.xcworkspace -scheme App -configuration Debug \
  -destination 'platform=iOS Simulator,name=iPhone 17 Pro' \
  -derivedDataPath /tmp/dd -allowProvisioningUpdates \
  CODE_SIGN_STYLE=Automatic DEVELOPMENT_TEAM=3LAJCPKLNV \
  CODE_SIGN_IDENTITY="Apple Development" build

# 4. Install + launch
SIM=$(xcrun simctl list devices available | grep -m1 "iPhone 17 Pro" | grep -oE '[0-9A-F-]{36}')
xcrun simctl boot "$SIM"; open -a Simulator          # `open` matters — see trap 2
xcrun simctl install "$SIM" /tmp/dd/Build/Products/Debug-iphonesimulator/App.app
xcrun simctl launch "$SIM" com.singhkapoortech.divit
xcrun simctl io "$SIM" screenshot /tmp/shot.png
```

`xcodebuild` + `xcrun simctl` cover build, install, launch and screenshot. **XcodeBuildMCP is not
required** (it wasn't available in the session that wrote this, and nothing was lost).

---

## Trap 1 — `CODE_SIGNING_ALLOWED=NO` breaks sign-in, not the build

The build succeeds. Then Google sign-in fails with a keychain error and the log shows:

```
SecItemCopyMatching (-34018)   →  errSecMissingEntitlement
```

No signing → no entitlements embedded → no `application-identifier` → Firebase Auth cannot write
the credential to the keychain. **The OAuth flow itself succeeds** (you'll see the
`oauth2.googleapis.com/token` request in the log), so it looks like an app bug, not a build flag.

Build with a real `DEVELOPMENT_TEAM`.

## Trap 2 — `codesign -d --entitlements` is the WRONG check here

It prints `{}` for a perfectly good simulator build. Simulator builds carry entitlements in the
Mach-O **`__TEXT,__entitlements`** section, not in the code signature. This false negative caused a
working fix to be thrown away and the whole approach abandoned as impossible.

```bash
strings -a /tmp/dd/Build/Products/Debug-iphonesimulator/App.app/App | grep -A1 application-identifier
# expect: 3LAJCPKLNV.com.singhkapoortech.divit
```

`otool -X -s __TEXT __entitlements` also works but its output is **word-swapped**, so naive
`grep` against it returns nothing and looks like a second failure. Use `strings`.

## Trap 3 — `simctl boot` is headless

The device boots, the app runs, screenshots work — and **no window appears**. Someone looking at
their Mac sees nothing and reasonably concludes it's broken. Run `open -a Simulator` (and
`osascript -e 'tell application "Simulator" to activate'` to raise it).

## Trap 4 — pointing the app at beta takes THREE changes, not one

`GoogleService-Info.plist` alone is not enough. Native Google sign-in also needs beta's
`REVERSED_CLIENT_ID` registered as a URL scheme, and prod's differs from beta's
(`...1627775` vs `...5098775`):

1. `cp <beta>.plist ios/App/App/GoogleService-Info.plist`
2. add beta's `REVERSED_CLIENT_ID` to `CFBundleURLSchemes` in `ios/App/App/Info.plist`
   (add it _alongside_ prod's — one Info.plist can serve both)
3. build the web assets with `--mode beta`

Get the beta plist with:
`firebase apps:sdkconfig IOS <appId> --project beta --out <path>`

**Verify before installing** — a wrong bundle sends test writes to prod:

```bash
grep -o "divit-beta\|divit-6d217" dist/assets/index-*.js | sort -u
plutil -extract PROJECT_ID raw <App.app>/GoogleService-Info.plist
```

Both files are git-tracked, so `git checkout ios/App/App/GoogleService-Info.plist
ios/App/App/Info.plist` restores prod. **Restore them as soon as the build is installed** — the
installed `.app` keeps its baked-in config, so restoring the repo doesn't disturb the running app.
Leaving prod config files pointing at beta is a nasty thing to forget.

## Trap 5 — you cannot automate sign-in on beta

Beta enables **Google and Apple only**. Both were verified closed for automation:

- `accounts:signUp` with email/password → `OPERATION_NOT_ALLOWED`
- anonymous `accounts:signUp` → `ADMIN_ONLY_OPERATION`
- Sign in with Apple needs an Apple ID configured in the Simulator's own Settings

So an authenticated session needs a human, or a service-account-minted custom token. Plan for a
person in the loop, or seed fixtures server-side (below) and test the parts that don't need auth.

## Trap 6 — NEVER screenshot during sign-in

This happened. A screenshot taken while the user was mid-Google-login captured the login screen.
The password was masked, but **the email address landed in the transcript on disk**
(`~/.claude/projects/*/<session>.jsonl`) and in terminal scrollback.

Wait for explicit confirmation that they're past the login screen before any screenshot or
accessibility dump. If it happens anyway: say so immediately, delete the file, and name where
else the value is recorded.

## Trap 7 — seed fixtures server-side instead of fighting the UI

Three attempts to drive the "add member" dialog failed. The cap being tested had nothing to do
with that dialog. Seeding the state directly through the Admin API and then exercising **one**
well-labelled control was faster and tested the actual thing:

```bash
# ⚠️ set the project explicitly; never rely on the ambient `firebase use`
firebase use beta && firebase use   # verify it prints divit-beta
```

Then create the documents you need and drive the single control under test.

---

## Maestro

Installed at `~/.maestro/bin/maestro`. It works on the Simulator and needs no MCP server.
**Maestro does not support physical iOS devices** — simulator only.

```bash
maestro --device "$SIM" test flow.yaml
maestro --device "$SIM" hierarchy > h.json     # accessibility tree WITH bounds
```

- **`--device` is required for `hierarchy`** when more than one Simulator is booted. `maestro test`
  silently auto-picks one; `hierarchy` errors out. Shut down spares with `xcrun simctl shutdown <udid>`.
- **`COMPLETED` does not mean it worked.** Every step of a 10-step flow reported `COMPLETED` while
  the member it was supposed to add was never added. A tap "succeeds" if it matched _something_.
  **Assert on state** — re-dump the hierarchy and check the value changed.
- **Ambiguous labels silently pick the wrong element.** `"Invite"` and `"Invite "` (trailing space)
  both existed; `index: 0` hit the label, not the button. Pull `bounds` from `hierarchy` and tap the
  coordinate: `tapOn: { point: "306,363" }`.
- **Elements with no `aria-label` are untappable by text.** The events `+` button has none, so it
  needed a percentage tap (`point: "86%,15%"`). `EventCard` _does_ have them
  (`Archive <name>` / `Unarchive <name>`) and was trivial to drive — **add `aria-label` to icon
  buttons; it doubles as the test hook.**
- In a Capacitor WebView the accessibility tree exposes the DOM well, so `hierarchy` is a good
  substitute for a DOM query.

---

## Trap 8 — a running Firebase _functions_ emulator corrupts the integration suite

`tests/integration/*` simulate Cloud Function triggers **in-process**. If a functions emulator is
also running, the real triggers fire _as well_, the ledger is processed twice, and you get
plausible-looking wrong numbers:

```
AssertionError: expected 150 to be close to 200
```

Two tests were briefly blamed on a source change that was entirely innocent. **Run the integration
suite via `npm run test:integration`**, which starts its own firestore-only emulator. If you have a
stack up for simulator work, tear it down first:

```bash
lsof -ti:9099,8081,4000,5001,4400,4500,9150 | xargs kill -9
```

---

## What device testing caught that nothing else did

Worth the effort at least once per feature:

- **A real bug in `minimumVersionService`.** `fetchAndActivate` and `getString` were in one `try`,
  so a throwing fetch skipped the read and returned `''` — a user who had already fetched a floor
  and then went offline silently lost it. Invisible to 29 passing unit tests; found because the
  wall refused to appear on a device.
- **The keychain/entitlement chain**, which no CI gate would ever have surfaced.

## What it did NOT need to catch

The caps, rules and ledger are covered by 78 rules tests and 227 integration tests against real
emulators. Don't rebuild that coverage in a simulator — it is slower, flakier, and proves less.
