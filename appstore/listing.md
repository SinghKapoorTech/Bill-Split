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

### Read this before submitting: two likely rejections

**1. Guideline 4.8 — Login Services.** The app offers Google Sign-In and nothing
else. Apple requires apps using a third-party login service to also offer a
login option that limits data collection to name and email and hides the user's
email if they choose — **Sign in with Apple** satisfies this. A consumer app with
Google-only sign-in is frequently rejected under 4.8. Adding Sign in with Apple
before submitting is the safest path.

**2. Reviewer sign-in.** Google accounts often refuse logins from unfamiliar
locations or demand 2FA, which blocks the reviewer and gets the build rejected as
"unable to sign in". Options, best first:

- Add Sign in with Apple (solves 4.8 and gives the reviewer a native path)
- Add an email/password provider and supply a dedicated demo account
- Supply a Google demo account with 2FA disabled — fragile, expect problems

### Notes (paste into the Notes field, adjusted to whichever you choose)

```
Divit splits bills by line item and settles balances between friends.

Signing in:
Use the demo account provided above. The account is pre-populated with sample bills, an event, and outstanding balances so all features are visible immediately.

Testing the core flow:
1. Home shows outstanding balances with each friend.
2. Bills > any bill opens the 4-step splitter: items, people, per-item assignment, and a review screen showing each person's share with tax and tip distributed proportionally.
3. Tapping Settle on a balance opens the settle sheet.

About Venmo:
"Charge on Venmo" opens the Venmo app via its URL scheme with an itemized note pre-filled. If Venmo is not installed on the review device it falls back to venmo.com in the browser. Divit does not process payments and takes no commission; Venmo handles the transaction entirely.

Camera:
Camera access is used only to photograph receipts for AI item extraction. Receipt images are stored privately against the user's own account.
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
