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

- **Build** — must be uploaded from Xcode/Transporter; not reachable from the web UI
- **App Review Information** — demo account, blocked on the sign-in decision below
- **App Privacy** labels and **age rating** questionnaire — separate sections
- **Guideline 4.8 risk** — the app offers Google Sign-In only. Apple requires a
  privacy-preserving alternative (Sign in with Apple satisfies it). This is a common
  rejection for consumer apps and is worth fixing *before* submitting.

### Sign in with Apple — progress (2026-09-05)

Step 1 of 5 is **done**. Do not redo it.

- [x] **App ID capability** — `com.singhkapoortech.divit` (`XLSVJ5V3B3`, team
      `3LAJCPKLNV`) now has Sign In with Apple enabled, **as a primary App ID**,
      server-to-server endpoint blank. Verified by reload, not by the save appearing
      to succeed. In-App Purchase and Push Notifications were left untouched.
- [ ] **Xcode entitlement** — `com.apple.developer.applesignin`. There is currently
      **no `.entitlements` file in the project at all**. Add it via Xcode's Signing &
      Capabilities UI rather than editing `project.pbxproj` by hand.
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
