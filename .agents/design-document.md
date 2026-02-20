# App Restructuring: Bills, Trips, Squads

## Design Document

**Date**: 2026-02-18
**Status**: Draft -- pending review

---

## 1. Overview

### Problem Statement

The current Bill Split app has a flat schema with a single `bills` collection and a `groups` collection that was bolted on after the fact. This structure cannot support:

- Running balances across multiple bills (Splitwise-style settle-up)
- Persistent friend groups with financial history
- Trip-scoped events with multiple bills from multiple contributors
- Payment tracking with audit trails
- Debt optimization across bills

### Goals

- Restructure around three core entities: **Bills**, **Trips**, **Squads**
- Add a **payments ledger** for tracking who paid whom
- Add **settle-up** functionality with debt optimization
- Support **bill mobility** -- bills can move freely between contexts
- Support **mixed identity** -- authenticated users + shadow profiles
- Maintain the existing anonymous share code flow for standalone bills

### Non-Goals

- UI/UX redesign (this document covers data + service layer only)
- Changing the Gemini AI receipt scanning flow
- Changing the Venmo deep link integration
- Real-time collaborative editing (keep existing `onSnapshot` pattern)

---

## 2. Requirements Summary

| # | Topic | Decision |
|---|-------|----------|
| Q1 | Bill permissions | Any Trip member can edit any bill in that Trip |
| Q2 | Bill mobility | Bills move freely between standalone / Trip / Squad |
| Q3 | Entity model | Three pages: Bills, Trips, Squads |
| Q4 | Settle-up | Debt optimization + timestamp-based settlement marker |
| Q5 | Payment tracking | Separate payments collection with full audit trail |
| Q6 | People identity | Mixed authenticated + shadow profiles (merge on sign-up) |
| Q7 | Balances | Computed dynamically, never stored |
| Q8 | Sharing | Anonymous share codes for Bills; authenticated membership for Trips/Squads |

---

## 3. Firestore Database Schema

### 3.1 Collections Overview

```
users/{userId}              -- User profiles (auth + shadow)
bills/{billId}              -- All bills (atomic unit)
trips/{tripId}              -- Trip events (container of bills)
squads/{squadId}            -- Persistent groups (container of trips + bills)
payments/{paymentId}        -- Payment ledger (who paid whom)
settlements/{settlementId}  -- Settlement snapshots (bulk settle-up records)
```

### 3.2 `users/{userId}`

Stores authenticated user profiles and shadow profiles. Shadow profiles are created when a user is invited by email/phone but has not signed up yet.

```typescript
interface UserProfile {
  uid: string;                    // Document ID = Firebase Auth UID (or generated for shadow)
  email?: string;
  displayName: string;
  photoURL?: string;
  venmoId?: string;
  phoneNumber?: string;

  // Identity
  isShadow: boolean;             // true if created via invite, not yet signed up
  mergedInto?: string;            // If shadow was merged, points to real UID

  // Social -- lightweight friend list for autocomplete
  friends: Friend[];             // Array of {name, venmoId?} for quick-add

  // Timestamps
  createdAt: Timestamp;
  lastLoginAt: Timestamp;
}

interface Friend {
  name: string;
  venmoId?: string;
}
```

**Changes from current schema:**
- Removed `squadIds: string[]` -- squads are now queried by `memberIds` on the squad document, not stored on the user.
- Added `isShadow` and `mergedInto` fields for shadow profile lifecycle.
- `friends` remains an inline array (simple, no need for subcollection at current scale).

### 3.3 `bills/{billId}`

The atomic unit. A single receipt/expense. Can be standalone, inside a Trip, or inside a Squad. The `tripId` and `squadId` fields determine context. A bill inside a Trip that belongs to a Squad has both fields set.

```typescript
interface Bill {
  id: string;
  createdBy: string;              // userId of creator (for audit, not permissions)

  // Context -- determines where this bill lives
  tripId?: string;                // If set, bill belongs to this Trip
  squadId?: string;               // If set, bill belongs to this Squad directly
                                  // (Note: if tripId is set and that Trip has a squadId,
                                  //  the bill is implicitly in the Squad via the Trip.
                                  //  This field is ONLY for bills directly in a Squad
                                  //  without a Trip.)

  // Bill content
  billData: BillData;
  itemAssignments: Record<string, string[]>;  // {itemId: [userId, ...]}
  people: Person[];               // Participants on this bill
  paidBy: string;                 // userId of who paid the actual bill (for balance calc)

  // Settings
  splitEvenly: boolean;
  title?: string;
  currentStep?: number;

  // Receipt image
  receiptImageUrl?: string;
  receiptFileName?: string;

  // Share link (standalone bills only)
  shareCode?: string;
  shareCodeCreatedAt?: Timestamp;
  shareCodeExpiresAt?: Timestamp;
  shareCodeCreatedBy?: string;

  // Timestamps
  createdAt: Timestamp;
  updatedAt: Timestamp;
  lastActivity: Timestamp;
}

interface BillData {
  items: BillItem[];
  subtotal: number;
  tax: number;
  tip: number;
  total: number;
  restaurantName?: string;
}

interface BillItem {
  id: string;
  name: string;
  price: number;
}

interface Person {
  id: string;                     // Stable userId (auth UID or shadow UID)
  name: string;
  venmoId?: string;
}
```

**Key changes from current schema:**
- Removed `billType` / `status` / `ownerId` / `groupId` / `members[]` / `savedAt`.
- Added `tripId` and `squadId` as optional context references.
- Added `paidBy` field -- critical for balance calculation. This is the person who actually paid the restaurant/vendor. Everyone else owes them.
- `createdBy` replaces `ownerId` (semantic clarity: creator, not owner, since editing is collaborative).
- `people[].id` now uses stable userIds (auth or shadow) instead of generated `person-{timestamp}` IDs. This is required for cross-bill balance tracking.
- Removed `members[]` (BillMember array). Access control for Trip/Squad bills is determined by Trip/Squad membership. Standalone bills use `createdBy` + share code.

### 3.4 `trips/{tripId}`

A self-contained event with its own member list and bills. Can optionally belong to a Squad.

```typescript
interface Trip {
  id: string;
  name: string;                   // "Vegas Weekend", "Ski Trip 2026"
  description?: string;
  createdBy: string;              // userId

  // Membership
  memberIds: string[];            // userIds of all members (auth + shadow)

  // Squad linkage (optional)
  squadId?: string;               // If set, this Trip is part of a Squad

  // Invitation
  pendingInvites: string[];       // Emails of invited but not-yet-joined users
  inviteCode?: string;            // Share code for joining (requires auth)
  inviteCodeExpiresAt?: Timestamp;

  // Timestamps
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
```

**Query patterns:**
- "My trips" = `where('memberIds', 'array-contains', userId)` + `orderBy('updatedAt', 'desc')`
- "Bills in this trip" = on `bills` collection: `where('tripId', '==', tripId)` + `orderBy('createdAt', 'desc')`
- "Trips in this squad" = `where('squadId', '==', squadId)` + `orderBy('updatedAt', 'desc')`

### 3.5 `squads/{squadId}`

A persistent group with running balances and settle-up capability. Contains Trips and standalone Bills.

```typescript
interface Squad {
  id: string;
  name: string;                   // "Roommates", "College Friends"
  description?: string;
  createdBy: string;              // userId

  // Membership
  memberIds: string[];            // userIds of all members

  // Invitation
  pendingInvites: string[];       // Emails
  inviteCode?: string;            // Share code (requires auth)
  inviteCodeExpiresAt?: Timestamp;

  // Timestamps
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
```

**Query patterns:**
- "My squads" = `where('memberIds', 'array-contains', userId)` + `orderBy('updatedAt', 'desc')`
- "Bills directly in this squad (no trip)" = on `bills`: `where('squadId', '==', squadId)` + `where('tripId', '==', null)` -- **NOTE: Firestore cannot query where field does not exist. Instead, use a sentinel value or query all squad bills and filter client-side. See Section 3.8.**
- "Trips in this squad" = on `trips`: `where('squadId', '==', squadId)`

### 3.6 `payments/{paymentId}`

Records individual payments between users. This is the ledger that tracks who paid whom, linked to specific bills. Used for both individual "mark as paid" actions and for settling up.

```typescript
interface Payment {
  id: string;
  fromUserId: string;             // Who is paying
  toUserId: string;               // Who is being paid

  amount: number;                 // Amount in dollars

  // Context -- where this payment applies
  billId?: string;                // Specific bill (for per-bill payments)
  tripId?: string;                // Trip context
  squadId?: string;               // Squad context
  settlementId?: string;          // If part of a bulk settle-up

  // Metadata
  note?: string;                  // "Venmo payment for pizza"
  method?: string;                // "venmo" | "cash" | "other"
  createdBy: string;              // Who recorded this payment

  // Timestamps
  createdAt: Timestamp;
}
```

**Query patterns:**
- "Payments for a bill" = `where('billId', '==', billId)`
- "Payments in a trip" = `where('tripId', '==', tripId)`
- "Payments in a squad" = `where('squadId', '==', squadId)`
- "Payments for a settlement" = `where('settlementId', '==', settlementId)`

### 3.7 `settlements/{settlementId}`

A point-in-time snapshot when users press "Settle Up." Captures which bills were included and the computed optimized debts at that moment. Even if bills are later moved, this record remains intact.

```typescript
interface Settlement {
  id: string;
  createdBy: string;              // Who initiated settle-up

  // Context
  tripId?: string;                // If settling a Trip
  squadId?: string;               // If settling a Squad

  // Snapshot at settlement time
  billIds: string[];              // Which bills were included
  settledAt: Timestamp;           // The timestamp marker

  // Optimized debts at time of settlement (for historical record)
  optimizedDebts: OptimizedDebt[];

  // Timestamps
  createdAt: Timestamp;
}

interface OptimizedDebt {
  fromUserId: string;
  toUserId: string;
  amount: number;
}
```

**Query patterns:**
- "Settlements for a trip" = `where('tripId', '==', tripId)` + `orderBy('settledAt', 'desc')`
- "Settlements for a squad" = `where('squadId', '==', squadId)` + `orderBy('settledAt', 'desc')`
- "Latest settlement" = above query + `limit(1)` -- used to determine which bills are "unsettled" (those created after `settledAt`)

### 3.8 Handling "bills directly in a Squad" queries

Firestore cannot query `where('tripId', '==', null)` for missing fields. Two approaches:

**Recommended approach: Sentinel value.** When a bill is directly in a Squad (no Trip), set `tripId: '__none__'` instead of omitting the field. Then query:
```
where('squadId', '==', squadId)
where('tripId', '==', '__none__')
```

Alternatively, query all bills with `where('squadId', '==', squadId)` and filter client-side. At expected scale (tens of bills per squad), this is acceptable.

**Decision: Use client-side filtering.** It avoids sentinel values polluting the data model and is simpler. The number of bills per squad will be small enough that fetching all and filtering is fine.

### 3.9 Composite Indexes Required

```json
{
  "indexes": [
    {
      "collectionGroup": "bills",
      "queryScope": "COLLECTION",
      "fields": [
        {"fieldPath": "createdBy", "order": "ASCENDING"},
        {"fieldPath": "createdAt", "order": "DESCENDING"}
      ]
    },
    {
      "collectionGroup": "bills",
      "queryScope": "COLLECTION",
      "fields": [
        {"fieldPath": "tripId", "order": "ASCENDING"},
        {"fieldPath": "createdAt", "order": "DESCENDING"}
      ]
    },
    {
      "collectionGroup": "bills",
      "queryScope": "COLLECTION",
      "fields": [
        {"fieldPath": "squadId", "order": "ASCENDING"},
        {"fieldPath": "createdAt", "order": "DESCENDING"}
      ]
    },
    {
      "collectionGroup": "trips",
      "queryScope": "COLLECTION",
      "fields": [
        {"fieldPath": "memberIds", "arrayConfig": "CONTAINS"},
        {"fieldPath": "updatedAt", "order": "DESCENDING"}
      ]
    },
    {
      "collectionGroup": "trips",
      "queryScope": "COLLECTION",
      "fields": [
        {"fieldPath": "squadId", "order": "ASCENDING"},
        {"fieldPath": "updatedAt", "order": "DESCENDING"}
      ]
    },
    {
      "collectionGroup": "squads",
      "queryScope": "COLLECTION",
      "fields": [
        {"fieldPath": "memberIds", "arrayConfig": "CONTAINS"},
        {"fieldPath": "updatedAt", "order": "DESCENDING"}
      ]
    },
    {
      "collectionGroup": "payments",
      "queryScope": "COLLECTION",
      "fields": [
        {"fieldPath": "tripId", "order": "ASCENDING"},
        {"fieldPath": "createdAt", "order": "DESCENDING"}
      ]
    },
    {
      "collectionGroup": "payments",
      "queryScope": "COLLECTION",
      "fields": [
        {"fieldPath": "squadId", "order": "ASCENDING"},
        {"fieldPath": "createdAt", "order": "DESCENDING"}
      ]
    },
    {
      "collectionGroup": "settlements",
      "queryScope": "COLLECTION",
      "fields": [
        {"fieldPath": "tripId", "order": "ASCENDING"},
        {"fieldPath": "settledAt", "order": "DESCENDING"}
      ]
    },
    {
      "collectionGroup": "settlements",
      "queryScope": "COLLECTION",
      "fields": [
        {"fieldPath": "squadId", "order": "ASCENDING"},
        {"fieldPath": "settledAt", "order": "DESCENDING"}
      ]
    }
  ]
}
```

### 3.10 Entity Relationship Diagram

```
+------------------+          +------------------+
|      Squad       |          |       Trip       |
|  id, name,       |  1---*   |  id, name,       |
|  memberIds[],    |<---------|  memberIds[],    |
|  createdBy       |          |  squadId?,       |
+--------+---------+          |  createdBy       |
         |                    +--------+---------+
         | 1                           | 1
         |                             |
         | *                           | *
+--------+---------+          +--------+---------+
|      Bill        |          |      Bill        |
|  squadId (direct)|          |  tripId          |
|  tripId = null   |          |  squadId = null  |
+------------------+          +------------------+

         Bill (standalone): tripId = null, squadId = null

+------------------+          +------------------+
|     Payment      |          |   Settlement     |
|  fromUserId,     |          |  tripId/squadId, |
|  toUserId,       |          |  billIds[],      |
|  billId?,        |          |  optimizedDebts[],|
|  tripId/squadId  |          |  settledAt       |
+------------------+          +------------------+
```

---

## 4. Security Rules

### 4.1 Design Principles

1. **Users collection**: Owner-only read/write (same as current).
2. **Bills**: Creator has full access. If bill is in a Trip, all Trip members have full access. If bill is in a Squad (directly), all Squad members have full access. Standalone bills with valid share codes allow anonymous read + limited update.
3. **Trips**: Members can read and update. Creator can delete. Anyone authenticated can create.
4. **Squads**: Members can read and update. Creator can delete. Anyone authenticated can create.
5. **Payments**: Readable by anyone involved (fromUser, toUser) or by members of the linked Trip/Squad. Creatable by authenticated users. Not editable after creation (append-only ledger).
6. **Settlements**: Readable by members of the linked Trip/Squad. Creatable by members. Not editable after creation (immutable snapshots).

### 4.2 Rules

```javascript
rules_version = '2';

service cloud.firestore {
  match /databases/{database}/documents {

    // ==================== HELPERS ====================

    function isAuthenticated() {
      return request.auth != null;
    }

    function isOwner(userId) {
      return isAuthenticated() && request.auth.uid == userId;
    }

    function onlyUpdating(allowedFields) {
      let affectedKeys = request.resource.data.diff(resource.data).affectedKeys();
      return affectedKeys.hasOnly(allowedFields);
    }

    // Check if current user is a member of a Trip
    function isTripMember(tripId) {
      return isAuthenticated() &&
        request.auth.uid in
          get(/databases/$(database)/documents/trips/$(tripId)).data.memberIds;
    }

    // Check if current user is a member of a Squad
    function isSquadMember(squadId) {
      return isAuthenticated() &&
        request.auth.uid in
          get(/databases/$(database)/documents/squads/$(squadId)).data.memberIds;
    }

    // ==================== USERS ====================

    match /users/{userId} {
      allow read, write: if isOwner(userId);
    }

    // ==================== BILLS ====================

    match /bills/{billId} {

      function hasValidShareCode() {
        return resource.data.shareCode != null &&
               resource.data.shareCodeExpiresAt != null &&
               resource.data.shareCodeExpiresAt > request.time;
      }

      function canAccessBill() {
        // Creator
        return request.auth.uid == resource.data.createdBy ||
        // Trip member (if bill is in a trip)
        (resource.data.tripId != null && isTripMember(resource.data.tripId)) ||
        // Squad member (if bill is directly in a squad)
        (resource.data.squadId != null && isSquadMember(resource.data.squadId));
      }

      // READ
      allow read: if
        hasValidShareCode() ||
        (isAuthenticated() && canAccessBill());

      // CREATE
      allow create: if
        isAuthenticated() &&
        request.resource.data.createdBy == request.auth.uid;

      // UPDATE
      allow update: if
        // Anonymous with share code: limited fields
        (hasValidShareCode() &&
          onlyUpdating(['itemAssignments', 'people', 'lastActivity', 'updatedAt'])) ||
        // Authenticated with access: full update
        (isAuthenticated() && canAccessBill());

      // DELETE
      allow delete: if
        isAuthenticated() &&
        request.auth.uid == resource.data.createdBy;
    }

    // ==================== TRIPS ====================

    match /trips/{tripId} {

      allow read: if
        isAuthenticated() &&
        (request.auth.uid in resource.data.memberIds ||
         request.auth.token.email in resource.data.pendingInvites);

      allow create: if
        isAuthenticated() &&
        request.auth.uid == request.resource.data.createdBy &&
        request.auth.uid in request.resource.data.memberIds;

      allow update: if
        isAuthenticated() &&
        request.auth.uid in resource.data.memberIds;

      allow delete: if
        isAuthenticated() &&
        request.auth.uid == resource.data.createdBy;
    }

    // ==================== SQUADS ====================

    match /squads/{squadId} {

      allow read: if
        isAuthenticated() &&
        (request.auth.uid in resource.data.memberIds ||
         request.auth.token.email in resource.data.pendingInvites);

      allow create: if
        isAuthenticated() &&
        request.auth.uid == request.resource.data.createdBy &&
        request.auth.uid in request.resource.data.memberIds;

      allow update: if
        isAuthenticated() &&
        request.auth.uid in resource.data.memberIds;

      allow delete: if
        isAuthenticated() &&
        request.auth.uid == resource.data.createdBy;
    }

    // ==================== PAYMENTS ====================

    match /payments/{paymentId} {

      allow read: if
        isAuthenticated() &&
        (request.auth.uid == resource.data.fromUserId ||
         request.auth.uid == resource.data.toUserId ||
         (resource.data.tripId != null && isTripMember(resource.data.tripId)) ||
         (resource.data.squadId != null && isSquadMember(resource.data.squadId)));

      allow create: if
        isAuthenticated() &&
        request.resource.data.createdBy == request.auth.uid;

      // Payments are append-only. No updates or deletes.
      allow update, delete: if false;
    }

    // ==================== SETTLEMENTS ====================

    match /settlements/{settlementId} {

      allow read: if
        isAuthenticated() &&
        ((resource.data.tripId != null && isTripMember(resource.data.tripId)) ||
         (resource.data.squadId != null && isSquadMember(resource.data.squadId)));

      allow create: if
        isAuthenticated() &&
        request.resource.data.createdBy == request.auth.uid;

      // Settlements are immutable snapshots. No updates or deletes.
      allow update, delete: if false;
    }
  }
}
```

### 4.3 Storage Rules

No changes needed. Current rules are adequate:
- `receipts/{userId}/**` -- owner read/write
- `receipts/collaborative/**` -- public (for shared bills)

### 4.4 Security Notes

- The `canAccessBill()` function for Trip/Squad membership uses `get()` calls which count as document reads. Each bill read that goes through Trip/Squad membership check costs 1 extra read. This is acceptable at current scale.
- Payments and Settlements are **immutable after creation** (no update/delete rules). This protects the financial audit trail. If a payment was recorded in error, the corrective action is to create a new payment in the opposite direction.
- The old `receiptAnalysisCache` collection with `allow read, write: if true` is removed.

---

## 5. Service Layer Architecture

### 5.1 Services Overview

```
src/services/
  userService.ts       -- User profiles, shadow users, profile merging
  billService.ts       -- Bill CRUD, share codes, item assignments
  tripService.ts       -- Trip CRUD, membership, invites    (NEW)
  squadService.ts      -- Squad CRUD, membership, invites   (REWRITE)
  paymentService.ts    -- Payment ledger operations          (NEW)
  settlementService.ts -- Settle-up operations               (NEW)
  balanceService.ts    -- Balance computation + debt optimization (NEW)
  gemini.ts            -- Unchanged (receipt analysis)
```

### 5.2 `userService.ts` (Modified)

Keep existing methods. Add:

```
mergeShadowProfile(shadowId: string, realId: string): Promise<void>
```

This method is called when a shadow user signs up with a real account. It:
1. Finds all bills where `people[].id == shadowId` or `paidBy == shadowId` and updates to `realId`.
2. Finds all trips/squads where `memberIds` contains `shadowId` and replaces with `realId`.
3. Finds all payments where `fromUserId` or `toUserId` == `shadowId` and updates.
4. Sets `mergedInto: realId` on the shadow user document.
5. Moves `friends` from shadow profile to real profile (merge, deduplicate).

This must be done in a **batched write** or **Cloud Function** to ensure atomicity across collections. Recommended: Cloud Function triggered on user creation that checks for matching shadow profiles by email.

### 5.3 `billService.ts` (Modified)

Remove: `joinBill`, `toggleItemAssignment`, `updatePersonDetails` (these become simpler with the new schema since access is Trip/Squad-based).

Keep: `createBill`, `getBill`, `updateBill`, `getBillByShareCode`, `generateShareCode`.

Add:
```
moveBill(billId, { tripId?, squadId? }): Promise<void>
  -- Updates tripId/squadId fields. Validates user has access to target Trip/Squad.

getBillsForTrip(tripId): Promise<Bill[]>
  -- Query: where('tripId', '==', tripId), orderBy('createdAt', 'desc')

getBillsForSquad(squadId): Promise<Bill[]>
  -- Query: where('squadId', '==', squadId), orderBy('createdAt', 'desc')
  -- Client-side filter: exclude bills that also have a tripId (those show under their Trip)

getStandaloneBills(userId): Promise<Bill[]>
  -- Query: where('createdBy', '==', userId), orderBy('createdAt', 'desc')
  -- Client-side filter: only bills where tripId and squadId are both null/undefined
```

Note on standalone bills query: Firestore does not support `where field == null` for missing fields. Options:
- Option A: Always set `tripId: null` and `squadId: null` explicitly on standalone bills. Then query `where('tripId', '==', null)`.
- Option B: Query all user bills and filter client-side.
- **Recommendation: Option A.** Explicitly set null values. This enables efficient server-side filtering and avoids fetching all bills.

### 5.4 `tripService.ts` (New)

```
createTrip(userId, name, description?, squadId?): Promise<string>
getTrip(tripId): Promise<Trip | null>
updateTrip(tripId, updates): Promise<void>
deleteTrip(tripId): Promise<void>
  -- Also deletes or detaches all bills in the trip

getUserTrips(userId): Promise<Trip[]>
  -- where('memberIds', 'array-contains', userId), orderBy('updatedAt', 'desc')

getTripsForSquad(squadId): Promise<Trip[]>
  -- where('squadId', '==', squadId), orderBy('updatedAt', 'desc')

addMember(tripId, userId): Promise<void>
  -- arrayUnion on memberIds

removeMember(tripId, userId): Promise<void>
  -- arrayRemove on memberIds

inviteMember(tripId, email): Promise<void>
  -- Adds email to pendingInvites

acceptInvite(tripId, userId, email): Promise<void>
  -- Moves email from pendingInvites to memberIds

generateInviteCode(tripId, userId): Promise<string>
  -- Creates a 6-char code for Trip joining (requires auth)

getTripByInviteCode(code): Promise<Trip | null>
joinTripByInviteCode(code, userId): Promise<void>
```

### 5.5 `squadService.ts` (Rewrite)

Same shape as `tripService` but for Squads. The current `squadService` uses a complex hydration pattern and stores `squadIds` on user documents. The new version simplifies this:

```
createSquad(userId, name, description?): Promise<string>
getSquad(squadId): Promise<Squad | null>
updateSquad(squadId, updates): Promise<void>
deleteSquad(squadId): Promise<void>

getUserSquads(userId): Promise<Squad[]>
  -- where('memberIds', 'array-contains', userId), orderBy('updatedAt', 'desc')

addMember(squadId, userId): Promise<void>
removeMember(squadId, userId): Promise<void>
inviteMember(squadId, email): Promise<void>
acceptInvite(squadId, userId, email): Promise<void>

generateInviteCode(squadId, userId): Promise<string>
getSquadByInviteCode(code): Promise<Squad | null>
joinSquadByInviteCode(code, userId): Promise<void>
```

**Key difference from current:** No more `squadIds` array on user documents. No more hydration step. Squad membership is determined solely by the `memberIds` array on the squad document.

### 5.6 `paymentService.ts` (New)

```
createPayment(payment: Omit<Payment, 'id' | 'createdAt'>): Promise<string>
  -- Creates a payment record. Append-only.

getPaymentsForBill(billId): Promise<Payment[]>
getPaymentsForTrip(tripId): Promise<Payment[]>
getPaymentsForSquad(squadId): Promise<Payment[]>
getPaymentsForSettlement(settlementId): Promise<Payment[]>
```

### 5.7 `settlementService.ts` (New)

```
createSettlement(
  context: { tripId?: string; squadId?: string },
  billIds: string[],
  optimizedDebts: OptimizedDebt[],
  userId: string
): Promise<string>
  -- Creates an immutable settlement snapshot.

getSettlementsForTrip(tripId): Promise<Settlement[]>
getSettlementsForSquad(squadId): Promise<Settlement[]>

getLatestSettlement(context: { tripId?: string; squadId?: string }): Promise<Settlement | null>
  -- Returns the most recent settlement. Used to determine the "unsettled since" cutoff.
```

### 5.8 `balanceService.ts` (New -- client-side only, no Firestore)

This is a **pure computation module** with no Firestore access. It takes bills and payments as input and returns computed balances.

```
computeRawDebts(bills: Bill[]): Debt[]
  -- For each bill, compute who owes whom based on paidBy, people, and itemAssignments.
  -- Returns an array of directed debts: {from, to, amount}.

subtractPayments(debts: Debt[], payments: Payment[]): Debt[]
  -- Subtracts completed payments from raw debts.

optimizeDebts(debts: Debt[]): OptimizedDebt[]
  -- Minimizes the number of transactions using debt simplification algorithm.

computeBalances(bills: Bill[], payments: Payment[]): Balance[]
  -- Combines the above: raw debts -> subtract payments -> net per-person balances.
  -- Returns: [{userId, netBalance}] where positive = owed money, negative = owes money.

getUnsettledBills(bills: Bill[], latestSettlement: Settlement | null): Bill[]
  -- Filters bills to only those created after the latest settlement's settledAt timestamp.
```

---

## 6. Hooks Architecture

### 6.1 Hooks Overview

```
src/hooks/
  -- Existing (modified) --
  useBillSession.ts       -- Real-time listener for a single bill (keep, simplify)
  useBillSplitter.ts      -- Bill calculation logic (keep, unchanged)
  useItemEditor.ts        -- Item editing state (keep, unchanged)
  usePeopleManager.ts     -- People management (modify: use stable userIds)
  useFileUpload.ts        -- File upload (keep, unchanged)
  useReceiptAnalyzer.ts   -- Gemini AI (keep, unchanged)
  useUserProfile.ts       -- User profile (keep, minor changes)
  useShareSession.ts      -- Share codes (modify: standalone bills only)

  -- New --
  useBills.ts             -- REWRITE: standalone bills list for Bills page
  useTripManager.ts       -- Trip CRUD + membership
  useTripBills.ts         -- Bills within a Trip + real-time listener
  useSquadManager.ts      -- REWRITE: Squad CRUD + membership
  useSquadBills.ts        -- Bills + Trips within a Squad
  usePayments.ts          -- Payment recording and querying
  useBalances.ts          -- Balance computation for a Trip or Squad
  useSettlement.ts        -- Settle-up flow
  useInvites.ts           -- Invitation management (unified for Trip + Squad)
```

### 6.2 Key Hook Designs

#### `useBills.ts` (Rewrite)

Manages the standalone Bills page. Only shows bills with no `tripId` and no `squadId`.

```typescript
function useBills() {
  // Real-time listener:
  //   where('createdBy', '==', userId)
  //   where('tripId', '==', null)
  //   where('squadId', '==', null)
  //   orderBy('createdAt', 'desc')

  return {
    bills: Bill[],
    isLoading: boolean,
    createBill: (billData) => Promise<string>,
    deleteBill: (billId) => Promise<void>,
  };
}
```

#### `useTripManager.ts` (New)

Manages the Trips page. Lists all trips the user is a member of.

```typescript
function useTripManager() {
  // Real-time listener:
  //   where('memberIds', 'array-contains', userId)
  //   orderBy('updatedAt', 'desc')

  return {
    trips: Trip[],
    isLoading: boolean,
    createTrip: (name, description?, squadId?) => Promise<string>,
    deleteTrip: (tripId) => Promise<void>,
    addMember: (tripId, userId) => Promise<void>,
    removeMember: (tripId, userId) => Promise<void>,
  };
}
```

#### `useTripBills.ts` (New)

Manages bills within a single Trip. Used on the Trip detail page.

```typescript
function useTripBills(tripId: string) {
  // Real-time listener on bills:
  //   where('tripId', '==', tripId)
  //   orderBy('createdAt', 'desc')

  return {
    bills: Bill[],
    isLoading: boolean,
    addBill: (billData) => Promise<string>,    // Creates bill with tripId set
    removeBill: (billId) => Promise<void>,     // Detaches bill (sets tripId to null)
    moveBillToTrip: (billId) => Promise<void>, // Attaches existing bill
  };
}
```

#### `useSquadManager.ts` (Rewrite)

Manages the Squads page. Similar structure to `useTripManager`.

```typescript
function useSquadManager() {
  // Real-time listener:
  //   where('memberIds', 'array-contains', userId)
  //   orderBy('updatedAt', 'desc')

  return {
    squads: Squad[],
    isLoading: boolean,
    createSquad: (name, description?) => Promise<string>,
    deleteSquad: (squadId) => Promise<void>,
    addMember: (squadId, userId) => Promise<void>,
    removeMember: (squadId, userId) => Promise<void>,
  };
}
```

#### `useSquadBills.ts` (New)

Manages the Squad detail view -- shows both direct bills AND trips within the squad.

```typescript
function useSquadBills(squadId: string) {
  // Listener 1 -- bills in squad:
  //   where('squadId', '==', squadId), orderBy('createdAt', 'desc')
  //   Client-side: split into directBills (no tripId) and tripBills (has tripId)

  // Listener 2 -- trips in squad:
  //   where('squadId', '==', squadId), orderBy('updatedAt', 'desc')

  return {
    directBills: Bill[],        // Bills added directly to squad (no trip)
    trips: Trip[],              // Trips under this squad
    tripBills: Record<string, Bill[]>,  // Bills grouped by tripId
    allBills: Bill[],           // Everything (for balance computation)
    isLoading: boolean,
  };
}
```

#### `useBalances.ts` (New)

Computes running balances for a Trip or Squad. Takes bills and payments as input, returns computed balances and optimized debts.

```typescript
function useBalances(
  contextType: 'trip' | 'squad',
  contextId: string
) {
  // Fetches:
  // 1. All bills in context (from useTripBills or useSquadBills)
  // 2. All payments in context (real-time listener)
  // 3. Latest settlement (one-time fetch)

  // Computes (via balanceService):
  // 1. Filter to unsettled bills only
  // 2. computeRawDebts -> subtractPayments -> optimizeDebts

  return {
    balances: Balance[],              // Net balance per person
    optimizedDebts: OptimizedDebt[],  // Minimized payment suggestions
    unsettledBills: Bill[],           // Bills since last settlement
    payments: Payment[],              // All payments in context
    isLoading: boolean,
  };
}
```

#### `useSettlement.ts` (New)

Manages the settle-up flow.

```typescript
function useSettlement(
  contextType: 'trip' | 'squad',
  contextId: string
) {
  return {
    settlements: Settlement[],        // Historical settlements
    settleUp: () => Promise<void>,    // Creates settlement snapshot
    isSettling: boolean,
  };
}
```

#### `usePayments.ts` (New)

Records and queries payments.

```typescript
function usePayments(
  contextType: 'bill' | 'trip' | 'squad',
  contextId: string
) {
  return {
    payments: Payment[],
    recordPayment: (from, to, amount, billId?) => Promise<void>,
    isLoading: boolean,
  };
}
```

### 6.3 Context Providers

```
src/contexts/
  AuthContext.tsx          -- Keep (modify: add shadow merge on sign-up)
  BillSessionContext.tsx   -- REMOVE (no longer needed -- each page manages its own state)
```

The current `BillSessionContext` wraps bill pages to provide `useBills` functionality. In the new model, each page (Bills, Trips, Squads) has its own hook for data fetching. The context is no longer needed.

---

## 7. Key Algorithms

### 7.1 Balance Computation

**Input**: Array of bills, each with `paidBy`, `people[]`, `itemAssignments`, and `billData`.

**Output**: Array of directed debts `{from, to, amount}`.

**Algorithm (per bill)**:

```
For each bill:
  1. Calculate each person's share using existing calculatePersonTotals() logic:
     personTotal = itemsSubtotal + proportionalTax + proportionalTip

  2. The person in paidBy paid the entire bill.
     Everyone else owes paidBy their personTotal.

  3. Emit directed debts:
     For each person P where P.id != bill.paidBy:
       emit {from: P.id, to: bill.paidBy, amount: P.personTotal}
```

### 7.2 Debt Optimization (Minimizing Transactions)

**Input**: Array of directed debts `{from, to, amount}`.

**Output**: Minimized array of directed debts.

**Algorithm (net balance method)**:

```
1. Compute net balance for each person:
   netBalance[person] = totalOwedToThem - totalTheyOwe

2. Separate into creditors (netBalance > 0) and debtors (netBalance < 0).

3. Sort creditors descending by amount, debtors ascending (most negative first).

4. Greedily match:
   While there are creditors and debtors:
     Take the largest creditor and largest debtor.
     transferAmount = min(creditor.amount, abs(debtor.amount))
     Emit {from: debtor, to: creditor, amount: transferAmount}
     Adjust both balances.
     Remove anyone with balance == 0.
```

This is the standard greedy debt simplification algorithm used by Splitwise. It minimizes the number of transactions to at most `N-1` where N is the number of people.

**Example**:
- Alice is owed $60 total, Bob owes $35, Carol owes $25.
- Optimized: Bob pays Alice $35. Carol pays Alice $25. (2 transactions instead of potentially more.)

### 7.3 Settle-Up Flow

```
1. User presses "Settle Up" on Trip or Squad page.

2. Client fetches:
   a. All unsettled bills (createdAt > latestSettlement.settledAt, or all if no prior settlement)
   b. All payments in context since last settlement

3. Client computes:
   a. Raw debts from unsettled bills (7.1)
   b. Subtract payments already made (7.2 input adjustment)
   c. Optimize remaining debts (7.2)

4. Client creates Settlement document:
   {
     tripId/squadId,
     billIds: [all unsettled bill IDs],
     optimizedDebts: [computed optimized debts],
     settledAt: now,
     createdBy: userId
   }

5. UI shows "Settlement complete" with the optimized debts summary.

6. After settlement, the balance view resets. Only bills created after
   settledAt will appear as "unsettled."
```

### 7.4 Payment Subtraction

When computing balances, individual payments are subtracted:

```
1. Start with raw debts from computeRawDebts(unsettledBills).

2. Net all debts between each pair:
   For each unique (A, B) pair, compute:
     netDebt = sum(A owes B) - sum(B owes A) - sum(payments A->B) + sum(payments B->A)

   If netDebt > 0: A owes B netDebt.
   If netDebt < 0: B owes A abs(netDebt).

3. Feed netted debts into optimizeDebts().
```

### 7.5 Shadow Profile Merge

When a user signs up and their email matches a shadow profile:

```
1. On auth state change (AuthContext), after user signs in:
   Query users collection: where('email', '==', user.email) AND where('isShadow', '==', true)

2. If shadow profile found:
   a. Update all bills: replace shadowId with realId in people[].id, paidBy, itemAssignments values
   b. Update all trips: replace shadowId in memberIds
   c. Update all squads: replace shadowId in memberIds
   d. Update all payments: replace shadowId in fromUserId, toUserId
   e. Merge shadow's friends[] into real user's friends[]
   f. Set shadow document: mergedInto = realId

3. This should run as a Cloud Function (too many cross-collection writes for client-side).
   Trigger: functions.auth.user().onCreate() -- check for matching shadow profile.
```

---

## 8. Migration Strategy

### 8.1 Overview

The migration transforms the existing schema into the new one. Since this is a client-side app with Firestore, migration happens via a one-time script (Node.js or Cloud Function).

### 8.2 Data Mapping

| Old | New |
|-----|-----|
| `users/{userId}` | `users/{userId}` -- remove `squadIds`, add `isShadow: false` |
| `bills/{billId}` (billType: 'private') | `bills/{billId}` -- set `tripId: null`, `squadId: null`, `paidBy: ownerId`, `createdBy: ownerId`. Remove `billType`, `status`, `ownerId`, `members`. |
| `bills/{billId}` (billType: 'group') | `bills/{billId}` -- set `tripId: <migrated trip ID>`, `squadId: null`, `paidBy: ownerId`, `createdBy: ownerId`. Remove old fields. |
| `groups/{groupId}` | `trips/{tripId}` -- map `ownerId` to `createdBy`, keep `memberIds`, `pendingInvites`. |
| `squads/{squadId}` (old) | `squads/{squadId}` -- add `createdBy` (first member), keep `memberIds`. Remove from user docs `squadIds`. |
| `groupInvitations/{id}` | Delete (invitations are now inline `pendingInvites` on Trip/Squad docs). |

### 8.3 Migration Script Steps

```
Phase 1: Migrate Users
  For each user document:
    - Remove squadIds field
    - Add isShadow: false
    - Preserve all other fields

Phase 2: Migrate Groups -> Trips
  For each group document:
    - Create new trip document with same ID (or generate new):
      {
        id, name, description,
        createdBy: group.ownerId,
        memberIds: group.memberIds,
        pendingInvites: group.pendingInvites || [],
        createdAt: group.createdAt,
        updatedAt: group.updatedAt
      }
    - Record mapping: oldGroupId -> newTripId

Phase 3: Migrate Bills
  For each bill document:
    - Set createdBy = bill.ownerId
    - Set paidBy = bill.ownerId (best guess -- owner likely paid)
    - If bill.billType == 'group' and bill.groupId exists:
        Set tripId = mapping[bill.groupId]
        Set squadId = null
    - Else:
        Set tripId = null
        Set squadId = null
    - Remove fields: billType, status, ownerId, groupId, members, savedAt
    - Preserve: billData, itemAssignments, people, splitEvenly, title,
                currentStep, receipt*, shareCode*, timestamps

Phase 4: Migrate Squads
  For each squad document:
    - Add createdBy = squad.memberIds[0] (creator unknown, use first member)
    - Add pendingInvites = []
    - Keep memberIds, name, description, timestamps

Phase 5: Cleanup
  - Delete all groupInvitations documents
  - Delete all old groups documents (now migrated to trips)
  - Remove receiptAnalysisCache collection
  - Deploy new security rules
  - Deploy new indexes

Phase 6: Deploy new client code
  - All new services, hooks, and components
```

### 8.4 Migration Safety

- **Backup first**: Export Firestore data before migration.
- **Idempotent**: Script should be safe to re-run (check for already-migrated documents).
- **Staged rollout**: Deploy security rules and indexes first. Then run migration script. Then deploy new client code.
- **Rollback plan**: Keep old documents for 30 days with a `_migrated: true` flag. If rollback needed, restore from backup.

### 8.5 People ID Migration

The current schema uses generated IDs like `person-{timestamp}` for people on a bill. The new schema requires stable userIds. During migration:

- For bills where the person has a matching `members[]` entry with a `userId`, use that `userId` as `person.id`.
- For bills where the person is name-only (no matching member), leave the generated ID. These bills will work as standalone but cannot participate in cross-bill balance tracking until the person is linked to a real or shadow user.
- The `paidBy` field is set to `ownerId` during migration (the bill creator is assumed to be the payer). Users can correct this manually after migration.

---

## 9. Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Shadow profile merge fails mid-way | Partial data with mixed IDs | Use Cloud Function with transaction/batched writes. Add retry logic. Mark shadow as `mergeInProgress` during merge. |
| Security rule `get()` calls for Trip/Squad membership add latency and cost | Slower reads, higher Firestore bill | Cache membership on the bill document as a denormalized `memberIds` field if performance becomes an issue. For now, the extra read is acceptable. |
| Bill mobility breaks settlement history | Users see inconsistent historical data | Settlements snapshot `billIds` at settle time. Historical view reads from snapshot, not live data. |
| `paidBy` field unknown for migrated bills | Incorrect balances for old bills | Set to `ownerId` during migration. Show a one-time prompt for users to verify/correct `paidBy` on old bills. |
| Large squads hit `memberIds` array limits | Firestore arrays have 40,000 element limit | Not a practical concern for friend groups. If needed later, move to a subcollection. |
| Debt optimization algorithm edge cases | Floating point rounding errors | Round all amounts to 2 decimal places. Add a tolerance threshold (amounts under $0.01 are zeroed out). |

---

## 10. Implementation Plan

### Step 1: New Type Definitions
**Complexity**: Low
**Files**: `src/types/bill.types.ts`, `src/types/trip.types.ts` (new), `src/types/squad.types.ts` (rewrite), `src/types/payment.types.ts` (new), `src/types/settlement.types.ts` (new)
**Acceptance**: All interfaces defined. No runtime changes.

### Step 2: Balance and Debt Optimization Utilities
**Complexity**: Medium
**Files**: `src/utils/balanceCalculations.ts` (new)
**Acceptance**: Pure functions with unit tests. `computeRawDebts`, `optimizeDebts`, `subtractPayments` all produce correct results for test scenarios.

### Step 3: New Service Layer
**Complexity**: Medium
**Files**: `src/services/tripService.ts` (new), `src/services/squadService.ts` (rewrite), `src/services/paymentService.ts` (new), `src/services/settlementService.ts` (new), `src/services/billService.ts` (modify)
**Acceptance**: All CRUD operations work against Firestore. Manual testing with Firestore emulator.

### Step 4: Firestore Rules and Indexes
**Complexity**: Medium
**Files**: `firestore.rules`, `firestore.indexes.json`
**Acceptance**: Rules deployed. All query patterns work without permission errors for authorized users and correctly deny unauthorized access.

### Step 5: New Hooks
**Complexity**: High
**Files**: All hooks listed in Section 6.
**Acceptance**: Each hook correctly subscribes to real-time data, exposes the expected API, and cleans up listeners on unmount.

### Step 6: Shadow Profile Merge (Cloud Function)
**Complexity**: High
**Files**: `functions/src/onUserCreate.ts` (new Cloud Function)
**Acceptance**: When a user signs up with an email that matches a shadow profile, all references are updated within 10 seconds.

### Step 7: Migration Script
**Complexity**: High
**Files**: `scripts/migrate-to-v2.ts` (new, standalone Node.js script)
**Acceptance**: Script transforms all existing data. Idempotent. Verified against production data backup.

### Step 8: UI Integration (Bills Page)
**Complexity**: Medium
**Files**: Dashboard components, bill creation flow.
**Acceptance**: Standalone bills page shows only tripId=null, squadId=null bills. Creating a bill works. Existing bill editing works.

### Step 9: UI Integration (Trips Page)
**Complexity**: High
**Files**: New Trip list page, Trip detail page, bill-within-trip components.
**Acceptance**: User can create trips, add members, add bills to trips. Real-time sync works across members.

### Step 10: UI Integration (Squads Page)
**Complexity**: High
**Files**: New Squad list page, Squad detail page with bills + trips + balances.
**Acceptance**: User can create squads, see running balances, view trips and direct bills within a squad.

### Step 11: Balance and Settle-Up UI
**Complexity**: High
**Files**: Balance display components, settle-up dialog, payment recording UI.
**Acceptance**: Balances compute correctly. Settle-up creates settlement record. Individual payments subtract from balances.

### Step 12: Invitation and Sharing UI
**Complexity**: Medium
**Files**: Invite dialogs for Trips/Squads, share code flow for Bills.
**Acceptance**: Trip/Squad invite codes work (require auth). Bill share codes work (allow anonymous). Shadow profiles created for email invites.

---

## 11. Open Questions

1. **Cloud Functions billing**: The shadow profile merge requires a Cloud Function. Is the project on the Firebase Blaze plan (required for Cloud Functions)?

2. **Existing bill `paidBy` data**: During migration we set `paidBy = ownerId`. Should we show a banner/prompt for users to verify this on old bills, or silently assume?

3. **Trip deletion behavior**: When a Trip is deleted, should its bills become standalone (detach), or be deleted too? Recommendation: detach (set `tripId: null`).

4. **Squad deletion behavior**: Same question. When a Squad is deleted, should its Trips be detached? Should direct bills become standalone? Recommendation: detach everything.

5. **Maximum members**: Is there a practical limit on Trip/Squad size we should enforce in the UI? Firestore arrays support up to 40,000 elements but the UI may not scale well past 20-30 people.
