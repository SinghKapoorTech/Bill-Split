# App Store Connect listing — Divit 1.0

Copy-paste into App Store Connect → iOS App 1.0 → App Store tab.

---

## Screenshots — upload to the 6.9" slot

The default view shows the **6.5"** slot (1242×2688 / 1284×2778). Our files are
**1320×2868**, which is the **6.9"** size and will be rejected by the 6.5" box.
Switch the display-size selector to 6.9" and upload `appstore/out/01.png` … `09.png`
in order.

Apple scales the 6.9" set down to every smaller iPhone class, so 6.5" can stay empty.
Only the first three appear on the install sheet, which is why the order is
scan → fair split → settle.

iPad screenshots are required because the app is universal
(`TARGETED_DEVICE_FAMILY = "1,2"`). 13" iPad, 2064×2752.

---

## Promotional Text (170 max)

```
Scan a receipt and Divit itemizes it in seconds — everyone pays for exactly what they ordered, tax and tip included. Settle up on Venmo in one tap.
```

## Description (4,000 max)

```
Split any bill by what each person actually ordered — not just down the middle.

Point your camera at a receipt and Divit's AI pulls out every item, price, tax and tip in seconds. Assign items to people with a tap, and Divit works out exactly what everyone owes, distributing tax and tip proportionally to what they ordered. Then send the request on Venmo with an itemized note attached.

SCAN ANY RECEIPT
• AI extracts items, prices, tax and tip automatically
• Edit anything before you split — you stay in control
• Or skip the camera and add items by hand

SPLIT IT FAIRLY
• Assign each item to one person or share it across several
• Tax and tip are distributed proportionally, to the cent
• Or split the whole thing evenly when that's simpler

SETTLE UP
• Charge or pay on Venmo in one tap, with an itemized note attached
• Or mark it settled when someone pays you in cash
• Balances update the moment anything changes

BUILT FOR TRIPS AND GROUPS
• Bundle every receipt from a trip into a single event
• Divit nets everything off so you settle with fewer payments
• Save the crews you split with often as Squads

MORE THAN DINNER
• Quick expenses for gas, tickets and cabs
• Stays and hotels, split by guest and by night
• Recurring bills on a schedule

NO APP REQUIRED FOR FRIENDS
Send a link and they can see the split in any browser.

Divit is free to use.
```

## Keywords (100 max — currently 92)

```
split bill,receipt scanner,venmo,expenses,roommate,group trip,IOU,settle up,shared costs,tab
```

Do not repeat words already in the app name ("Divit", "Bill", "Splitter") — Apple
indexes those separately, so repeating them wastes characters.

## Support URL

```
https://www.divit-bill.com/contact
```

Must resolve to a page with a way to contact you. If the landing page has no
contact route, add one before submitting — a dead or contact-less support URL is
a common rejection.

## Marketing URL (optional)

```
https://www.divit-bill.com
```

## Copyright

```
2026 Amanpreet Singh Inderpreet Singh
```

## Version

```
1.0
```

## App Store Version Release

Choose **Manually release this version**. It lets you confirm the listing looks
right before it goes live, rather than shipping the moment review passes.

---

## App Review Information

**Sign-in required: YES** — the app gates everything behind auth.

⚠️ Ticking that box exposes **User Name** and **Password** fields in App Store
Connect. Divit has no email/password provider, so there are no such credentials
to give — both real providers are OAuth. Check whether ASC will accept the
section with those fields blank plus an explanatory note, or whether it blocks
submission. If it blocks, the choices are a Google demo account (which may be
refused at login from Apple's network) or adding an email/password provider for
review purposes. Settle this before you start the submission, not during it.

### Sign-in and deletion — both 4.8 and 5.1.1(v) are now satisfied

**Guideline 4.8 — Login Services: RESOLVED.** Sign in with Apple shipped
2026-09-06 (`c144ad2`) alongside Google. It is offered **on iOS only**
(`shouldOfferApple`, `src/utils/authProviders.ts` — `platform === 'ios'`), which
is where 4.8 applies; off iOS the sign-in screen shows a notice that an
Apple-created account lives in the iOS app. The reviewer, on an iOS device, sees
Sign in with Apple first.

**Guideline 5.1.1(v) — account deletion: RESOLVED.** Deletion is initiated
in-app from **Settings → Profile**, in plain sight, with no support contact. It
cascades the ledger rather than only removing the auth user.

**Reviewer sign-in is no longer fragile.** The old risk was Google refusing a
login from an unfamiliar location and the build being rejected as "unable to sign
in". A reviewer can now use Sign in with Apple with their own Apple ID, including
Hide My Email.

⚠️ **But a fresh Apple sign-in lands in an EMPTY account.** There is no
email/password provider, so a pre-populated demo account can only be a Google one
— exactly the fragile path Apple sign-in was meant to avoid. Decide one before
submitting:

- **Preferred:** let the reviewer sign in with Apple and follow the notes below,
  which walk through creating a bill by hand in under a minute. Nothing in the
  core flow needs pre-existing data.
- Supply a Google demo account anyway, pre-populated, and accept that it may be
  blocked at login. If you do, keep the Apple path in the notes as the fallback.

Whichever you choose, the Notes field below must match it — the current text
assumes the Apple path.

### Notes (paste into the Notes field, adjusted to whichever you choose)

```
Divit splits bills by line item and settles balances between friends.

Signing in:
Tap "Sign in with Apple" on the launch screen. Your own Apple ID works, including
Hide My Email — no demo account is required. (Google sign-in is also offered.)
Sign in with Apple is presented on iOS only.

Testing the core flow (a new account starts empty; this takes about a minute):
1. From the dashboard, create a new bill and add two or three items with prices
   by hand. A receipt photo is optional — the AI scan is a shortcut, not the only
   path, and every extracted line item is editable before splitting.
2. Add two people to the bill.
3. Assign items: tap a person to attach them to a line item, or share one item
   across several people.
4. The review step shows each person's share, with tax and tip distributed
   proportionally to what they ordered rather than split evenly.
5. Tapping Settle on a balance opens the settle sheet.

Deleting the account:
Settings > Profile > Delete Account. Deletion is initiated entirely in-app and
removes the account and its associated data.

About Venmo:
"Charge on Venmo" opens the Venmo app via its URL scheme with an itemized note
pre-filled, falling back to venmo.com in the browser if Venmo is not installed on
the review device. Divit does not process payments and takes no commission —
this is real-world peer-to-peer money movement handled entirely by Venmo, so
Guideline 3.1.1 does not apply.

Camera and AI:
Camera access is used only to photograph receipts. Images are sent to Google
Gemini for item extraction and stored privately against the user's own account.
Extracted items are AI estimates and are editable before any split is made.
```

### Contact Information

Your own name, phone and email — App Review uses this to reach you.

---

## Not on this page, but required before submission

- **App Privacy** (separate section): declare data collection. At minimum you
  collect email/name (account), user content (receipt images), and identifiers.
  Privacy policy URL — `/privacy` exists in the app.
- **Age rating** questionnaire.
- **Build**: upload via Xcode or Xcode Cloud; it then appears under "Add Build".
