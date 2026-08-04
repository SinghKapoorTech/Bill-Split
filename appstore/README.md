# App Store screenshots

Two tiers, **both required** — the app is universal
(`TARGETED_DEVICE_FAMILY = "1,2"`), so Apple requires an iPad set as well as
iPhone.

| Tier | Files | Size | Upload slot |
| --- | --- | --- | --- |
| iPhone | `out/01.png` … `09.png` | 1320 × 2868 | **6.9" Display** |
| iPad | `out-ipad/01.png` … `06.png` | 2064 × 2752 | 13" iPad |

Apple scales the 6.9" set down to every smaller iPhone class, so the 6.5" slot
can stay empty. **Do not upload the 1320×2868 files into the 6.5" slot** (it
accepts 1242×2688 / 1284×2778 and will reject them).

The iPad set is six frames, not nine, on purpose: at 1032pt wide the app renders
its DESKTOP layout, and the Settle Up modal, Create dialog and Squads screens read
as a small dialog or a fifth of a page on that canvas. Apple requires only one
screenshot per tier, so padding with weak frames buys nothing.

```
frames.config.mjs   iPhone copy + colours + type scale
ipad.config.mjs     iPad equivalent (6 frames, retuned for a 3:4 canvas)
template.html       the marketing frame, shared by both tiers (CSS-variable driven)
render.mjs          composites captures into frames and verifies the result
capture.sh          tap-free screen capture from a booted simulator
screens/            iPhone captures, 1320x2868
screens-ipad/       iPad captures, 2064x2752
out/ , out-ipad/    the deliverables
```

## Regenerate the frames

```bash
node appstore/render.mjs                # iPhone: screens/ -> out/
node appstore/render.mjs --set ipad     # iPad:   screens-ipad/ -> out-ipad/
node appstore/render.mjs --placeholder  # no captures needed, proves the pipeline
```

`render.mjs` is the correctness gate. It fails the run if any frame's text
overflows or wraps unexpectedly (measured in-browser, not by character count), if
the Outfit webfont didn't load, if the copy collides with the device, or if a PNG
isn't exactly 1320 × 2868 with colour type 2 (**Apple rejects alpha**).

`npm test` additionally asserts copy line lengths and that every headline clears
WCAG contrast against its background (3:1, the large-text bar — 92px bold).

## Re-capture the screens

1. Seed demo data on **beta** (never prod):
   `node scripts/seed-demo-data.mjs --me <UID> --commit`
   Seeds _bills_ only and lets the deployed ledger pipeline compute balances, so
   every figure on screen is real app output. Verify the balances before
   capturing — never photograph a ledger you haven't checked.
2. Build against beta and run on the iPhone 17 Pro Max simulator.
3. Capture each screen with `appstore/capture.sh` (see its header for the
   pristine-`index.html` prerequisite, which must be refreshed after every build):

   ```bash
   ./appstore/capture.sh <device-udid> appstore/screens 04-balances.png "/dashboard" '[]' 15
   ```

   The iPad renders the desktop layout, so some markers differ — the header
   button reads "Create a bill" rather than "Create", and the bill entry step is
   a two-column layout whose left card is titled "Receipt Upload".

An iPad simulator starts signed out. Rather than signing in again, copy the app's
data container across from the iPhone simulator — it carries the Firebase auth
session:

```bash
cp -R "$(xcrun simctl get_app_container <iphone-udid> com.singhkapoortech.divit data)/Library" \
      "$(xcrun simctl get_app_container <ipad-udid> com.singhkapoortech.divit data)/"
```

Teardown: `node scripts/seed-demo-data.mjs --me <UID> --commit --teardown`

### Capture gotchas that cost real time

- **Never pass `CODE_SIGNING_ALLOWED=NO` to `xcodebuild`.** It strips
  entitlements, so Keychain returns `-34018` and Firebase Auth fails with
  `ERROR_KEYCHAIN_ERROR (17995)`.
- **Never `simctl uninstall`.** It wipes the data container and signs the user
  out; `simctl install` upgrades in place.
- The iOS project points at **prod**. Capturing against beta requires temporarily
  swapping `ios/App/App/GoogleService-Info.plist` and the `GIDClientID` +
  reversed-client URL scheme in `Info.plist` to the beta iOS app
  (`1:509877505233:ios:5196675c9374c3b4aec9f0`). **Revert both before
  committing.** A build-configuration-driven setup would remove this footgun.
- Driving the WebView to a screen: patch `index.html` _inside the installed
  simulator bundle_, inject `<base href="/">` (relative asset paths 404 on
  multi-segment routes and produce a blank page with no JS error), and click
  until a marker appears rather than a fixed number of times (a wizard's starting
  step depends on the data).

## Open issues found while building this

- **Changing a bill's `paidById`/`ownerId` after the ledger has processed it
  corrupts balances.** The stored `processedBalances` footprint is keyed by UID,
  so the reversal misses when the creditor changes — observed as a net of $362.68
  where $71.84 was correct. Users can reassign "paid by", so this looks reachable
  in production. `scripts/reconcile-balances.mjs` repairs this class of drift (and
  hardcodes a Windows token path, so it is currently broken on macOS).
- **Opening a bill whose `items` array is empty leaves the wizard on an infinite
  loading spinner** (`AIScanView`'s `isSessionLoaded` never resolves).
- `divit-beta` had no iOS app registered, so beta could not test any iOS change.
  One now exists.
- CLAUDE.md is inaccurate on two points: the mobile breakpoint is **1024px**
  (not 768px), and **any** authenticated user can read **any** `users/{uid}`
  document (`firestore.rules:9`), not just their own.
