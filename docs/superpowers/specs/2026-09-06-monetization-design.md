# Divit Monetization Design — 2026 Launch

**Status:** Design approved in principle; not yet implemented.
**Date:** 2026-09-06
**Decision owner:** @amaninderpreetsingh

---

## 1. Decision summary

Ship a **capped free tier + flat-price unlimited Pro subscription**, live at App Store launch,
implemented via **RevenueCat**, with all limits served from **Firebase Remote Config**.

A **Trip Pass** consumable ships alongside, as a deliberate hedge against the one real
weakness of a subscription in this category — episodic usage. See §4.4.

**A credit system is explicitly rejected.** See §3.

| Tier          | Price                 | Contents                                                                         |
| ------------- | --------------------- | -------------------------------------------------------------------------------- |
| **Free**      | $0                    | 5 AI scans/month, 2 active owned groups, unlimited everything else               |
| **Trip Pass** | $3.99 / 14 days       | Unlimited scans + owned groups for 14 days. No Pro-only features. Does not renew |
| **Pro**       | $4.99/mo or $34.99/yr | Unlimited scans + groups, recurring bills, Airbnb per-night mode, Squads, export |

---

## 2. Context and constraints

### Where the product actually is

- **Pre-launch.** Beta testing; Play releases go to `track: internal` only
  (`.github/workflows/android.yml:63`). Zero public users.
- **No monetization infrastructure of any kind exists.** No payment SDK among 88
  dependencies. No RevenueCat, Stripe, or IAP plugin.
- **No usage telemetry.** `getAnalytics(app)` is initialized (`src/config/firebase.ts:40`)
  but there is **not a single `logEvent` call** in the codebase. Every number in this
  document is therefore a hypothesis, not a measurement.
- Ships to **iOS + Android + web** (Vercel).

### Revenue goal

Stated target: **meaningful side income**, ~$2,000/month.

Store commission is **15%**, not 30% — Apple Small Business Program and Google Play's
first-$1M rate both apply and will for years.

```
$2,000/mo net  →  ~$2,353 gross
                →  ~470 subscribers at $4.99
                →  ~12,000 MAU at a 4% conversion rate
```

This is realistically an **18–30 month outcome**, not a 2026 one. The market is also
**US-only** in practice: Venmo is US-only and there is no multi-currency support
(`src/utils/format.ts:7` is literally `` `$${value.toFixed(2)}` ``).

### Unit economics

The one paid third-party API is Gemini. `functions/src/index.ts:132` uses
`gemini-2.5-flash-lite`; exactly one `generateContent` call per scan (`:167`); no retry
logic; images pre-compressed to 800–1024px web (`useFileUpload.ts:32-38`) / 1600px native.

| Item                                  | Cost         |
| ------------------------------------- | ------------ |
| One AI scan                           | **~$0.0004** |
| 50 scans                              | $0.02        |
| 1,000 scans                           | $0.40        |
| Receipt image storage (~10k receipts) | ~$0.05/mo    |
| Current total infra                   | $4–20/mo     |
| Projected at 1,000–5,000 users        | $200–500/mo  |

**The dominant cost at scale is not Gemini.** It is the ~19 deployed Cloud Functions —
especially `ledgerProcessor` firing on every bill write (`ledgerProcessor.ts:1132`),
`scheduledLedgerReconcile`, and the `onSnapshot` listeners. Those scale with
**engagement**, not with scans.

---

## 3. Rejected: the credit system

The original proposal was 50 credits/month, consumed by AI scans and group creation, with
a paid plan granting more credits. Rejected for four independent reasons:

1. **It recovers nothing.** 50 scans is **$0.02** of Gemini spend. The engineering cost of
   a credit ledger — balances, top-ups, expiry, refund-on-failure, "out of credits" UI —
   exceeds the recovered cost by three to four orders of magnitude, permanently.
2. **It meters the wrong resource.** Scanning is the cheapest thing the app does. Credits
   would tax the $0.0004 action and leave the engagement-driven Cloud Function spend —
   the actual cost driver — completely unmetered.
3. **Charging for group creation taxes acquisition.** Groups are the viral loop: each one
   pulls 3–8 non-users into a share link via a genuinely account-free guest path
   (`joinBillAsGuest`, `billFunctions.ts:314`). Gating that is paying for growth with
   growth. Splitwise gates receipt scanning and never gates group creation — that is not
   an accident.
4. **Credits add friction to the habit.** Every scan becomes a decision: "is this worth a
   credit?" The habit loop depends on scanning being reflexive.

### The one good argument credits were reaching for

There is a real weakness in a pure subscription here, and it is worth stating plainly so it
isn't rediscovered later: **bill splitting is episodic**, and subscriptions churn badly on
episodic products. Some users will pay once before a trip and never accept a recurring
charge.

That argument is correct. It is just not an argument for a _credit ledger_ — it is an
argument for a time-boxed one-off purchase, which is what the **Trip Pass (§4.4)**
provides, at a fraction of the complexity.

### The asymmetry that settles it

**Cap → credits** is a migration nobody is harmed by. **Credits → cap** requires refunding
outstanding balances across two app stores. Caps preserve optionality; credits spend it
before there is a single data point to spend it on.

---

## 4. Tier design

### 4.1 Free forever — never gated, under any circumstances

These are the moat and the growth loop. Gating any of them is self-harm.

- **Guest join / claim / pay** — `joinBillAsGuest`, `updateGuestName`, `leaveBillAsGuest`,
  `claimShadowUser`. No account, no download, all the way through to Venmo.
- **Joining groups and bills owned by others** — unlimited, forever.
- **Settling up and approving settlements** — a paywall must _never_ stand between a
  person and paying someone back.
- **Manual / quick bills** — unlimited.
- **Share links.**

**Rule: cap what a user _owns_, never what they _join_.** The loop must stay
unobstructed on the receiving end.

### 4.2 Free tier caps

| Limit               | Launch default | Recommendation                    |
| ------------------- | -------------- | --------------------------------- |
| AI scans per month  | **5**          | Consider 10 — see risk note below |
| Active owned groups | **2**          | Consider 3 — see risk note below  |

**Risk note (flagged, owner chose the tighter values):** the median user scans 4–8
receipts a month, so a cap of 5 fires at the median — i.e. the typical user meets a
paywall _before_ completing three full loops and forming a habit. Because the marginal
cost of loosening is $0.004/user, the asymmetry strongly favours starting loose. Both
values are Remote Config, so this is reversible without a release.

**Rule: tighten later, never loosen later.** Existing users get grandfathered. A too-tight
launch loses users silently and you never learn why.

### 4.2.1 What makes an owned group "active"

**Decision: a group is active until its owner manually archives it.** Not settlement-based,
not time-based.

**This does not exist yet.** `TripEvent` (`src/types/event.types.ts`) has no status field,
and `useEventManager` exposes only `createEvent` (`:57`) and `deleteEvent` (`:78`). Add
`archived: boolean` (default `false`) plus `archivedAt`, an `archiveEvent` mutation, and an
Archived section in the events list.

**Archive is not delete, and the difference is the whole point.** `deleteEvent` already
cascades through `eventDeleteProcessor` and reverses the ledger footprints — it *erases the
money*. Archiving must do the opposite: it hides the event from the active list and frees a
slot, while **every balance stays live and owed**.

This falls out of the existing architecture for free. The Stage 2 friend ledger
(`balances/{uid1_uid2}`) is independent of the Stage 3 event ledger, so a debt from an
archived event still surfaces in the friend-level balance and can still be settled. Nothing
in `ledgerProcessor` needs to change.

**Archiving must never require settlement first.** Blocking archive on an outstanding
balance would re-create the exact trap this decision exists to remove — the user with two
unsettled trips would be locked out permanently, which is precisely the person most likely
to have two unsettled trips.

**Rules:**

- **Owner-only, and global.** An event being over is a shared fact, not a per-person
  preference. Members see it under Archived too. Only owned groups count against the cap,
  so this never affects a member's own limit.
- **Unarchiving is gated by the same cap.** Otherwise the limit is bypassable in three taps:
  archive A → create C → unarchive A. Unarchive must run the same check as create and fail
  the same way.
- **Balances are untouched** by archive and unarchive, in both directions.
- The cap blocks **creating and unarchiving only**. Reading, editing, adding bills to, and
  settling an existing group are never gated — including for a user who is over the limit
  after a Trip Pass expires (§7).

**Archive is a SOFT LOCK, not a view filter.** An archived event stops accepting
**new bills**. Viewing it, editing existing bills, and **settling up** stay fully available
— a person must never be blocked from paying someone back.

This is what makes the cap mean anything. If archiving only hid the event, the bypass would
be: archive both events, keep using them exactly as before, create two more. Two routes had
to be closed for this to hold — `EventDetailView` carried its own event mapping that dropped
`archived`, and `recurringBillProcessor` generated into archived events indefinitely. A
recurring template aimed at an archived event now pauses and records why, rather than
stopping silently; a rent split that vanishes without explanation is worse than one that
fails loudly.

**⚠️ Prerequisite if recurring bills ever gain an `eventId`.** As of chunk 2 no client path
sets one — `recurringBillService` supports the field but none of the three recurring wizards
passes it, so a recurring template cannot be attached to an event. The archive pause guard in
`recurringBillProcessor` is therefore correct, tested, and **unreachable**: kept deliberately
as the safe default rather than as shipped behaviour.

The day a wizard starts passing `eventId`, two things must land with it: a confirmation when
archiving an event that owns active templates ("this event has N recurring bills that will
stop generating"), and UI surfacing `pausedReason: 'event-archived'` on the recurring-bills
screen. Without them a rent split stops silently and the owner finds out weeks later from a
roommate. The filter is cheap — `useRecurringBills` already loads the owner's templates via
an existing `(ownerId, createdAt)` index, so it needs no new query, index, or rule.

**⚠️ Chunk 3 owes the server-side half.** Chunk 2's lock is client-side plus the recurring
processor. Bill creation runs through `createBill` in `functions/src/billFunctions.ts`, so
the authoritative "no new bills in an archived event" check must land with the cap
enforcement — until then, anyone with devtools can still write one.

**Counting: query, do not store.** Enforce with a Firestore aggregation
(`where('ownerId','==',uid).where('archived','==',false).count()`) rather than a maintained
counter. Requires one composite index. This repo has already been burned badly enough by
derived-state drift to have built a nightly reconciler for it
(`scheduledLedgerReconcile`); a stored group counter is the same class of bug, and the
count here is small enough that the query is trivially cheap. **Do not add a counter that
can disagree with reality.**

### 4.3 Pro — $4.99/mo, $34.99/yr

Unlimited scans, unlimited owned groups, plus:

- **Recurring bills** (`functions/src/recurringBillProcessor.ts`)
- **Airbnb per-night mode** (`src/components/airbnb-wizard/`)
- **Squads** (`functions/src/squadFunctions.ts`)
- **Export**

**On price:** $4.99 rather than undercutting Splitwise's ~$3. The pitch is "you actually
get paid back," which is worth more than a ledger, and pricing below an incumbent signals
you are the inferior copy. The **annual tier matters more than the monthly** — it
front-loads cash and avoids month-to-month churn management there is no analytics to
support.

### 4.3.1 Quota visibility — making limits obvious without nagging

A cap the user cannot see is a trap. Hitting "you're out of scans" with no warning is the
single worst conversion moment there is: it reads as punishment, not as an offer.

**But the obvious implementation recreates the problem §3 rejects.** A permanent "3 scans
left" badge turns every scan back into a spend decision — the precise friction that made
credits a bad idea. Visibility must therefore be **progressive**, not constant.

#### Scan quota — disclose progressively

| Remaining | Where it appears | Tone |
| --- | --- | --- |
| 5 or 4 | Settings only | Silent. Do not nag a user who is nowhere near the limit. |
| 3 or 2 | Ambient chip on Dashboard + AI scan entry point | Neutral: "3 scans left this month · resets Oct 1" |
| 1 | Same placements, emphasised | "Last free scan this month" |
| 0 | Pre-action wall (see below) | Offer, with both paths out |

**Always show the reset date alongside the count.** "3 left" reads as terminal and creates
anxiety; "3 left, resets Oct 1" reads as a rhythm. This one word of copy does most of the
work of making a cap feel fair.

#### Repeated scan failures — guidance, not a wall

A user photographing a crumpled receipt can burn their whole rate-limit window without one
success, and be told only "you can scan up to N receipts per hour" — true and useless.

Track `consecutiveScanFailures` on `usage/{userId}` (Admin-SDK-only, like every other field
there), and classify each attempt:

| Outcome | Effect on the streak |
| --- | --- |
| Success | Reset to **0** |
| **Extraction** failure — Gemini answered but the result was unusable (unparseable JSON, no items found) | **+1** — this is the image being bad |
| **Infrastructure** failure — transport error, timeout, Google-side quota | **Unchanged** — not the user's fault, and must never push them toward a "your photo is bad" message |

At `SCAN_FAILURE_STREAK_CAP` (3), replace the generic parse error with actionable guidance:
*"We couldn't read that receipt after 3 tries. Try a clearer photo: good lighting, receipt
flat, whole receipt in frame."*

**The cap changes the message only — it never blocks scanning.** The user must always be able
to recover by submitting a better photo, and a single success resets the streak immediately.

**Failed scans still consume a rate-limit slot.** That is deliberate: refunding on failure
reopens the exact bypass the pre-reservation exists to close (deliberately error to scan for
free), and by that point the Gemini call has usually already been paid for. The fix for the
bad UX is an accurate, actionable message — not a refund.

#### Non-negotiable UX rules

- **Check quota _before_ the action, never after.** Blocking a user after they have framed
  and taken a photo — or worse, after `analyzeBill` returns — is infuriating. The AI scan
  entry point must be visibly gated at zero, before the camera opens.
- **A failed scan must not consume quota, and the UI must show that immediately.** The
  counter increments on success only (§5.4); if a scan errors, the number must visibly not
  move, or users will assume they were charged and complain.
- **Pro and Trip Pass users never see a counter.** Show nothing, or "Unlimited". A paying
  user being reminded of limits is a downgrade in experience.
- **Trip Pass is the exception — always show its remaining days.** "Trip Pass · 6 days
  left". It is time-boxed and non-renewing, so the user genuinely needs it to plan. This is
  information, not a nag.

#### Group cap — the wall must offer the free escape hatch first

On the events screen, show "2 of 2 groups active" **only when at the limit**.

When creating (or unarchiving) is blocked, the message must present **both** paths:

> **You have 2 active groups.** Archive one you're finished with, or go unlimited with Pro.
> `[ Archive a group ]` `[ See Pro ]`

**Archive must be the first and most prominent option.** A wall that only offers payment,
when a free escape exists, is a dark pattern — users notice, and it costs more trust than
the conversion is worth. It is also self-defeating: the person who repeatedly archives to
stay under the cap is demonstrating exactly the usage pattern that converts on its own.

Per §4.2.1, archiving is always permitted regardless of outstanding balances, so this
escape hatch can never be unavailable.

#### Data plumbing

The client needs live quota state, so `usage/{userId}` is **readable by its owner** while
staying Admin-SDK-write-only:

```
match /usage/{userId} {
  allow read: if request.auth.uid == userId;
  allow write: if false;
}
```

An `onSnapshot` listener updates the counter the instant a scan lands. Group counts use the
same aggregation query as enforcement (§4.2.1), so the number the user sees and the number
the server enforces are derived identically and cannot disagree.

**Client display is never the gate.** These reads drive rendering only; enforcement stays
entirely server-side (§5.3).

### 4.4 Trip Pass — $3.99 for 14 days

**Why it exists.** Bill splitting is **episodic**, not habitual. Usage spikes hard around a
trip or a shared house, then goes quiet for months. Subscriptions fit habitual products and
churn badly on episodic ones — people cancel between trips and don't return. A meaningful
share of users will happily pay something _once_ before a trip but will never accept a
recurring charge. A pure subscription leaves that revenue uncollected.

This is the one legitimate argument the credit proposal was reaching for. The Trip Pass
captures it at roughly 5% of the engineering cost of a credit ledger, because it needs
**one expiry timestamp** rather than a balance, a decrement, a refund path, and a rollover
policy.

**Contents:** unlimited AI scans and unlimited owned groups for 14 days. **Pro-only
features are excluded** — no recurring bills, no Airbnb per-night mode, no Squads, no
export.

**Anti-cannibalisation — this is the part that has to be right.** If the pass is better
value per day than the subscription, everyone buys the pass and Pro dies.

|             | Price | Days | Cost/day   |
| ----------- | ----- | ---- | ---------- |
| Trip Pass   | $3.99 | 14   | **$0.285** |
| Pro monthly | $4.99 | 30   | **$0.166** |

Pro is ~1.7× better per day _and_ carries more features, so anyone who expects to use the
app beyond about two weeks should rationally subscribe. Two passes ($7.98) cost more than a
month of Pro ($4.99), so **repeat buyers self-select into the subscription** — which is
exactly the intended behaviour. The pass is deliberately poor value for habitual use; its
only job is to monetise the once-or-twice-a-year trip organiser who would otherwise pay
nothing.

**Rules:**

- Buying a pass while one is active **extends** the expiry by 14 days; it does not stack
  balances or start a second pass.
- Pro subscribers must not be offered the pass. Hide it entirely when `plan == 'pro'`.
- On expiry the user reverts to Free. Per §7, they **never lose access to data they
  already created** — only the ability to create beyond the free cap is re-gated.
- No proration and no refunds. This must be stated on the purchase sheet (§6.2).

**Open risk:** the pass is untested. If it turns out to cannibalise Pro rather than
supplement it, the response is to raise its price or shorten its window — both of which are
store-config changes, not code changes. Track pass-vs-subscription mix from day one.

---

## 5. Architecture

### 5.1 Entitlement storage — security-critical

**`firestore.rules:40-46` currently grants `allow update: if request.auth.uid == userId`
on `users/{userId}` — whole-document, with no field-level guard**, even though the repo
has an `onlyUpdating()` helper used elsewhere (`firestore.rules:65`).

A `credits`, `plan`, or `isPro` field placed on `UserProfile`
(`src/types/person.types.ts:35-52`) as-is would be **directly rewritable by the user from
a browser console.**

**Required:** entitlement and consumption state lives in a collection with
`allow write: if false`, written **only by the Admin SDK**. Follow the existing pattern
used for `balances` / `event_balances` / squads.

```
entitlements/{userId}         # Admin SDK only
  plan: 'free' | 'pro' | 'trip_pass'
  source: 'revenuecat'
  productId: string
  expiresAt: timestamp        # subscription renewal date, or trip pass expiry
  inGracePeriod: boolean
  updatedAt: timestamp

usage/{userId}                # Admin SDK only
  scanPeriodStart: timestamp  # UTC month boundary
  scansThisPeriod: number
```

**There is deliberately no stored `ownedActiveGroups` counter** — see §4.2.1. Active groups
are counted with a Firestore aggregation query at gate time, so the number cannot drift.

**Effective-plan resolution.** A user can legitimately hold both a Trip Pass and a
subscription (they buy a pass, then subscribe mid-trip). Resolve server-side, in this
order, on every gated call:

1. Active `pro` subscription (`expiresAt` in the future, or `inGracePeriod`) → **Pro**
2. Active `trip_pass` (`expiresAt` in the future) → **unlimited scans + groups, no Pro
   features**
3. Otherwise → **Free**

The pass is never consumed or refunded when a subscription supersedes it — it simply stops
mattering. Do not attempt to prorate.

**Time is server time.** Expiry must be evaluated against the server clock, never a
client-supplied timestamp, or a device with its date rolled back gets a free pass forever.

### 5.2 Limits — Firebase Remote Config

**Do not hardcode `5` and `2`.** These numbers are guesses made with zero data; they will
be wrong; and a hardcoded limit makes every correction an App Store review cycle plus
weeks of update lag.

Remote Config keys: `free_scans_per_month`, `free_active_groups`, `paywall_enabled`.

**⚠️ Bound every Remote Config value at the fetch site.** `getNumber()` returns **0** for an
unpublished or misspelled key, and the rate limiter proved in testing that structural
validation alone is not enough: `windowMs: 3600` — the classic seconds-for-milliseconds typo
— allowed **3600 scans against a 30/hour limit** while passing every `> 0` check, so nothing
logged and the backstop was silently off. Magnitude bounds are required, not just type
bounds. Recommended: `limit` clamped to `[1, 1000]`, `windowMs` to `[60_000, 86_400_000]`
(1 minute to 24 hours), with a `logger.warn` whenever a fetched value is clamped.
Read server-side for enforcement, mirrored client-side for UI copy. Enables cohort
segmentation and an emergency kill switch.

### 5.3 Billing — RevenueCat

One SDK across App Store, Play, and web. Handles receipt validation, renewals, grace
periods, refunds, and restore.

```
Purchase → RevenueCat → webhook → Cloud Function → entitlements/{userId}
                                                 ↑ Admin SDK only
```

Client reads `entitlements/{userId}` for UI state. **Enforcement is server-side only** —
the client entitlement read is a rendering hint, never a gate.

**The Trip Pass is the harder half of this.** RevenueCat's core abstraction is the
subscription entitlement, which it manages end to end. Non-renewing purchases give you back
more responsibility, so budget for it explicitly:

- The webhook must write **`tripPassExpiresAt`**, computed `= max(now, existing) + 14d`
  **server-side from the purchase event**, never from anything the client sends.

  > **CORRECTED 2026-09-08, during chunk 4.** This bullet originally said the webhook
  > must set `plan: 'trip_pass'`. That is wrong, and the shipped code deliberately does
  > not do it. `shared/entitlements.ts` resolves an active pass from `tripPassExpiresAt`
  > **independently of `plan`**, precisely so a pass survives alongside a subscription
  > (§5.1). Writing `plan: 'trip_pass'` would DOWNGRADE a Pro subscriber who also buys a
  > pass. Using `now + 14d` rather than `max(now, existing) + 14d` would also rob a user
  > who buys early of the days they paid for.

- Purchases are **not idempotent by default.** Key the webhook handler on RevenueCat's
  **`event.id`** and ignore replays, or a retried delivery grants two passes.

  > **CORRECTED 2026-09-08, during chunk 4.** This bullet originally said `transaction_id`.
  > That would silently drop every renewal after the first, because `transaction_id` is
  > stable across `RENEWAL` events for one subscription. `event.id` is unique per event
  > and identical across retries of that event, which is the property this bullet wanted.
- Handle "purchase succeeded but the webhook didn't land." This is the single most common
  consumable failure and it produces a user who paid and got nothing. Reconcile on app
  foreground by querying RevenueCat for unprocessed purchases, and keep a manual grant path
  for support.
- Extension semantics live here: if a pass is already active, `expiresAt += 14d` rather than
  `expiresAt = now + 14d`, or a user who buys early loses the days they paid for.

### 5.4 Enforcement points

| Gate            | Location                                   | Current state                  |
| --------------- | ------------------------------------------ | ------------------------------ |
| Scan quota      | `analyzeBill`, `functions/src/index.ts:78` | **No usage limit of any kind** |
| Owned-group cap | Event creation path                        | None                           |

`analyzeBill` today checks only: auth (`:90-92`), a `data:image/` prefix (`:96-105`), an
8MB ceiling (`:116-127`), and `maxInstances: 10` (`:86` — a _concurrency_ cap, not a usage
cap). An authenticated user can loop it indefinitely.

Quota check must happen **before** the Gemini call, and the counter must increment
**only on success** so a failed scan is never billed against the user.

---

## 6. Prerequisites and launch blockers

### 6.1 Security — required regardless of pricing

| Item                                     | Detail                                                                                              |
| ---------------------------------------- | --------------------------------------------------------------------------------------------------- |
| **Lock down `users/{userId}` writes**    | `firestore.rules:40-46` — whole-doc client write. Blocks any entitlement work.                      |
| **App Check**                            | Absent entirely (no `initializeAppCheck` anywhere). Needed once scans are a sold good.              |
| **Per-user rate limit on `analyzeBill`** | Independent of quota; abuse backstop.                                                               |
| **Strip production logging**             | `GuestClaimView.tsx:69-112` dumps user IDs, names, and participant arrays to console in production. |
| **Hardcoded maintainer UIDs**            | `functions/src/index.ts:568-572`.                                                                   |

### 6.2 App Store submission blockers

| Item                     | Guideline / reason                                                                                                                                                                                                                                 |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Sign in with Apple**   | **Guideline 4.8** — the app authenticates with Google (`googleProvider`, `src/config/firebase.ts`). Third-party login requires an equivalent privacy-preserving option. This is the most common first-submission rejection for apps of this shape. |
| **Restore Purchases**    | Rejected without it. Must restore an unexpired Trip Pass too, not just subscriptions.                                                                                                                                                                                                                               |
| **Paywall disclosure**   | **Guideline 3.1.2** — price, duration, and links to Terms + Privacy must appear on the paywall screen itself. The Trip Pass sheet must additionally state that it **does not renew** and is non-refundable.                                                                                                                                      |
| **Store product config** | **Three** products now: monthly sub, annual sub, and the Trip Pass consumable. Plus tax and banking forms. These take **days** to clear, not hours. Start early.                                                                                                                       |
| **Listing rewrite**      | `appstore/listing.md:60` currently states "Divit is free to use."                                                                                                                                                                                  |

### 6.3 Push notifications — required before launch

**Not currently present.** Zero hits for `PushNotifications` / `FCM`;
`@capacitor/push-notifications` is not in `package.json`.

Subscriptions do not monetize signups; they monetize **month two**. An app that cannot
re-engage a user is a one-session app, and that churn will make the pricing look wrong
when the real defect is retention. Splitwise's highest-engagement feature is its reminder.

Minimum viable set: settle-up reminder, "someone claimed their items," "you were added to
a bill."

### 6.4 Analytics — required to tune anything

With zero `logEvent` calls there is no way to learn whether the caps are right. Minimum:
scan performed, cap reached, paywall viewed, purchase started/completed, group created,
settlement completed.

---

## 6.5 The database will be wiped before launch

The owner confirmed (2026-09-06) that all current Firestore data is **test data and will be
erased before launch**. Nothing in this spec needs a migration, a backfill, or a
compatibility shim for documents written by earlier code. §7 is retained only as a record of
the reasoning.

**What this changes:**

- No backfill of `archived` onto existing events; no backfill of `usage/` or `entitlements/`.
- **Set `archived: false` explicitly when an event is created.** Chunk 2 deliberately avoided
  a server-side `where('archived','==',false)` filter because Firestore does not match
  documents missing a field, which would have hidden every pre-existing event. With a clean
  database and the field always written at creation, chunk 3's owned-active count can use the
  straightforward equality query instead of the `count(all) - count(archived == true)`
  subtraction described in §4.2.1.
- **Keep the defensive reads anyway.** `isEventArchived` must still treat a missing field as
  active, and the `usage/`/`entitlements/` readers must still tolerate absent documents — a
  freshly created event has no `archived` value until someone archives it, and a user has no
  usage document until their first scan. Absence is a normal steady state, not just a legacy
  artefact.

**What this does NOT change:** every validation, fail-closed default and sanity bound in this
document stands. They guard against malformed model output, forged client writes and
misconfiguration — none of which a clean database prevents.

## 7. Backward compatibility

**Existing beta testers will trip the caps the moment they ship.**

- Grandfather beta users, or seed `usage/{userId}` such that nobody is retroactively
  blocked from data they already created.
- **Existing groups above the cap must not become inaccessible.** The cap gates _creating_
  a new group, never _reading or settling_ an existing one. A user over the limit keeps
  full access to what they have and is blocked only from creating more.
- Users with no `entitlements` doc default to `free` — absence must never fail open to
  Pro, nor fail closed to a broken app.

---

## 8. Open questions

1. ~~What makes an owned group "inactive"?~~ **RESOLVED — manual archive/close. See §4.2.1.**
2. **Should the Airbnb per-night mode be Pro or free?** It is a genuine differentiator and
   trip organisers are the likeliest payers, which argues Pro. But it may also be an
   acquisition wedge. Provisionally Pro.
3. **Share links expire after 7 days** (`billService.ts:397`) with no guest-renewal path.
   A guest who bookmarks a bill loses access permanently. This damages the strongest
   differentiator and should be fixed independent of pricing.
4. **Web pricing.** The Vercel build could take Stripe at ~3% instead of 15%. Worth ~12
   points of margin, but adds a second billing path to maintain. Deferred.

---

## 9. Out of scope

Multi-currency, expense categories, spending charts, payment rails beyond Venmo, offline
mode, CSV export tooling (beyond the Pro flag), cross-group debt netting, comments.

---

## 10. Requirements Q&A

Captured verbatim so nothing is re-litigated after a `/clear`.

| Question                                    | Answer                                                                                                                             |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| What is this revenue for in 2026?           | **Meaningful side income** — a few hundred to a couple thousand a month; willing to trade some growth for real money.              |
| Where is the app on usage?                  | **Beta testing, planning on putting to the App Store.** Pre-launch, zero public users.                                             |
| Why would someone pick this over Splitwise? | **Getting actually paid; AI scan is just better; better UI and non-login path for guests.** Plus a code audit for further reasons. |
| What should the paid tier sell?             | **Free is 5 scans per month and 2 active groups.** (Capped free + unlimited Pro; no credit ledger.)                                |
| When should the paywall be live?            | **Live at App Store launch.**                                                                                                      |
| Billing implementation?                     | **RevenueCat.**                                                                                                                    |
| Push notifications vs. day-one paywall?     | **Add push before launch; paywall stays day one.**                                                                                 |
| Why not a credit system?                    | Marginal cost is $0.0004/scan, the worst-case heavy user costs $0.04, and scanning is a chore rather than a treat — see §3.        |
| Is a migration needed for existing data?    | **No.** All current data is test data and will be erased before launch. See §6.5. |
| Is archive a view filter or a lock?          | **Soft lock.** No new bills in an archived event; viewing, editing and settling always work. |
| Can a free user join groups beyond the cap?  | **Yes, unlimited.** The cap counts only groups you CREATED. Being added to someone else's is never gated. |
| What makes a group inactive?                | **Manually close or archive.** Not settlement-based. See §4.2.1.                                                                    |
| Show free users their remaining quota?      | **Yes** — progressive disclosure, silent until 3 remain. See §4.3.1.                                                                |
| Add a Trip Pass?                            | **Yes** — $3.99 / 14 days, to cover episodic users a subscription misses. See §4.4.                                                |

---

## 11. Audit appendix — differentiators vs Splitwise

Ranked, with code evidence. Used to decide what is gateable and what must stay free.

1. **Zero-account guest path, end to end.** `joinBillAsGuest` (`billFunctions.ts:314`)
   requires no auth and mints an `isShadow: true` user; `ledgerProcessor.ts:122-131` puts
   that shadow into the creditor's real balance doc while still unregistered;
   `claimShadowUser` (`billFunctions.ts:611`) upgrades losslessly across every bill on
   signup. **Splitwise structurally cannot match this.** → Must stay free.
2. **Item-level assignment with honest tax/tip.** `shared/calculations.ts:41-49`
   distributes tax/tip across the whole subtotal, not just claimed items — the comment at
   `:38` documents the first-claimer bug it avoids.
3. **Debt simplification that doesn't lie.** `optimizeDebts.ts:14-18` warns in-source that
   net redistribution "can reassign debts to uninvolved parties"; the event path uses pure
   cycle elimination instead. Directly answers the best-known Splitwise complaint.
4. **Two-sided settlement.** Debtor requests, creditor approves, record immutable
   (`firestore.rules:274`), mistakes reversible. Splitwise allows unilateral marking.
5. **Airbnb per-night view.** Date range → one item per night.
6. **Live collaborative claiming.** `CollaborativeSessionView.tsx` + `onSnapshot`.
7. **Ledger correctness machinery.** Nightly `scheduledLedgerReconcile` drift detection.
   Marketing copy, not a switching reason.

**Positioning line — true of this codebase, false of Splitwise:**

> _Scan the receipt, everyone taps what they ordered from a link — no accounts, no
> downloads — and Venmo's you back with an itemized note._

**Do not lead with** trips, recurring bills, or groups: Splitwise does all three, and the
superior failure-mode handling here is invisible until something breaks.

### Known gaps vs Splitwise

Multi-currency (none — USD hardcoded), expense categories (none), spending charts (none),
payment rails beyond Venmo (none — US-only), push notifications (none — §6.3),
comments (none), offline mode (none), CSV export (none), cross-group debt netting (none),
"shares" split method (`shared/splitAmounts.ts:13` has only equal/percentage/exact).
