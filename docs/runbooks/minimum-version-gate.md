# Runbook — the minimum-version gate

**What it does:** stops a native build that is too old to talk to the current backend, and
tells the user to update instead of letting them hit unexplained permission errors.

**Why it exists:** chunk 3 closed direct client writes to `events`, which permanently breaks
any installed binary using the old `addDoc` path. That was recoverable exactly once — iOS 1.0
had never been submitted, so the only affected builds were TestFlight ones we could replace.
**It cannot be recovered again.** You cannot add a version check to binaries already on
people's phones, so the check ships in 1.0, before there is anything to strand.

## How to use it

The gate is **inert until you publish a value.** No value = no floor = nobody is
ever walled. That is the steady state and the safe default.

**Do not publish from the Firebase console** — `config/remote-config/<env>.json`
is the source of truth and the next `npm run rc:publish` would silently revert a
console edit. See `docs/runbooks/remote-config.md`.

To require an update:

1. Edit `config/remote-config/<beta|prod>.json`.
2. Set the key **for the platform you mean** (they are separate — see below):
   - `minimum_supported_version_ios`
   - `minimum_supported_version_android`
3. `npm run rc:publish -- <beta|prod>`

To retract, set the value back to `""` and publish again. Both directions take
up to **1 hour** to reach a running app (`MINIMUM_FETCH_INTERVAL_MS` in
`src/services/minimumVersionService.ts`), plus a relaunch.

## ⚠️ iOS and Android are on DIFFERENT versions — that is why the keys are split

| Platform | Ships    | Source                                        |
| -------- | -------- | --------------------------------------------- |
| iOS      | **1.0**  | `ios/App/App.xcodeproj` `MARKETING_VERSION`   |
| Android  | **1.3**  | `android/app/build.gradle` `versionName`      |

A single shared key had no correct value, and an earlier draft of this runbook
told you to keep the floor at or below `package.json` (`1.0.0`) — which is both
inert (iOS is exactly at it) and, if raised enough to gate Android, walls
**every iOS user**. There is deliberately no shared key and no fallback.

## Rules that are not negotiable

- **Set a floor only to a version already live in that platform's store.**
  Walling users on a build nobody can install yet is a full outage with no way
  out: the wall's only button sends them to a listing still offering the build
  you just banned. Publish the floor **after** the new build is live.
- **Never set a floor above what that platform currently ships** (iOS 1.0,
  Android 1.3, per the table above). That walls everyone on it, including you.
- **`package.json` is not the app version.** It is `1.0.0` and matches neither
  store build. Do not use it to pick a floor.

## What it deliberately does NOT do

- **Web is never gated** (`shared/versionGate.ts`). The web app is served fresh and has no
  service worker, so a stale build cannot exist there; a wall would be a bug that a refresh
  had already fixed.
- **It never blocks on ambiguity.** No key, an empty key, an unparseable version on either
  side, Remote Config unreachable or throttled, the `App.getInfo()` plugin failing — every
  one of those resolves to "let them in". An update wall replaces the entire product with a
  dead end, so it fires only on positive, well-formed evidence. Covered by
  `tests/versionGate.test.ts`.
- **It does not re-check while the app is running**, and a LATE answer is dropped.
  Evaluated once per process; if the check outruns the 1.5s budget the app renders and the
  wall is not raised in that session (`shouldWallNow`). Raising it later would unmount the
  whole tree under someone mid-bill, and `useBillSession` drops its pending debounced write
  on unmount without flushing — so a late wall would silently discard an edit. The next cold
  start walls the build, by which point nothing is in progress.

## Where the pieces are

| File                                             | Role                                                   |
| ------------------------------------------------ | ------------------------------------------------------ |
| `shared/versionGate.ts`                          | Pure comparison + decision. All the fail-open logic.   |
| `tests/versionGate.test.ts`                      | 29 tests, mostly about NOT blocking.                   |
| `src/services/minimumVersionService.ts`          | Reads the build version + Remote Config. Never throws. |
| `src/hooks/useMinimumVersion.ts`                 | Bounded (1.5s) wait, then renders regardless.          |
| `src/components/shared/UpdateRequiredScreen.tsx` | The wall. Store links verified against the repo.       |
| `src/App.tsx` (`VersionGate`)                    | Wraps the app OUTSIDE every provider and the router.   |

## Traps found while building this

- **Compare numerically, never lexically.** `'1.10.0' < '1.9.0'` as strings — a lexical
  compare walls every user the moment the minor version reaches double digits. Tested.
- **`getString` returns `''` for a misspelled key.** If empty meant "block", a typo in a
  config key name would brick the installed app. Empty means "no floor".
- **The store links must be right.** They are the only escape hatch on the screen; a wrong id
  turns the wall into a dead end. Taken from `capacitor.config.ts` /
  `android/app/build.gradle` (`com.singhkapoortech.divit`) and `appstore/SUBMISSION.md`
  (ASC `6760331853`) rather than guessed — the first draft of this file guessed the Android
  package and got it wrong.

## Verified on device (iOS simulator, 2026-09-07)

Built with `xcodebuild` against the local Firebase emulators (never prod) and run on an
iPhone 17 Pro simulator:

1. **App launches normally with no minimum published** — the gate ran on platform `ios`,
   attempted a Remote Config fetch, failed against the demo project, and correctly let the
   user through. The fail-open path, exercised on a real device rather than argued for.
2. **The wall renders correctly** when a minimum above the running version is in force —
   layout, copy, and the store button all correct at device size.
3. **Reverting the minimum returns the app to normal.**

### What device testing found that the tests did not

The first attempt to force the wall **failed to show it**, and the cause was a real bug, not
a testing artifact. `fetchAndActivate` and `getString` were inside ONE try block, so a
throwing fetch skipped the read entirely and returned `''`. In production that meant a user
who had already fetched a minimum and then went offline — or simply got throttled, which is
routine given the one-hour fetch interval — silently lost the floor. Firebase's model is that
a failed fetch leaves previously activated config in place. The two operations are now
separate, and only the read decides. This was invisible to the unit tests, which cover the
pure decision logic and never touch Remote Config.

### Still not verified

**Signed-in native flows.** `ios/App/App/GoogleService-Info.plist` points at PROD, and the
native `@capacitor-firebase/authentication` plugin uses it rather than the JS SDK's emulator
settings — so signing in on the simulator would authenticate against production and create a
real user. Not attempted. Verifying event creation or scanning end-to-end on device needs a
beta `GoogleService-Info.plist` swap first.
