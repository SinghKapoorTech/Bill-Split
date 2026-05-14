# Draft Bill Visibility Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent draft bills from appearing to anyone except the bill owner, on both the dashboard and event detail view.

**Architecture:** Two client-side in-memory filters (one per query subscriber) plus one Firestore security rule change. No new indexes. No schema changes. Draft bills created during wizard flow stay owner-only until the wizard's "Done" button sets status to `'active'`.

**Tech Stack:** TypeScript, React, Firebase Firestore, Firestore Security Rules

---

## Files Modified

| File | Change |
|------|--------|
| `src/hooks/useBills.ts` | Filter out other users' draft bills after snapshot |
| `src/pages/EventDetailView.tsx` | Filter out other users' draft bills in event subscription callback |
| `firestore.rules` | Add `isNotDraft()` helper; gate all non-owner read paths on it |

---

## Task 1: Filter draft bills from the dashboard

**Files:**
- Modify: `src/hooks/useBills.ts:63-78`

- [ ] **Step 1: Apply the filter in the snapshot callback**

In `src/hooks/useBills.ts`, find the `onSnapshot` callback (lines 63–78). The current code maps docs to bills then immediately uses `bills[0]` as the active session. Add one filter line after the `.map()`:

Replace:
```typescript
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const bills = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        } as Bill));

        if (bills.length > 0) {
          setActiveSession(bills[0]);
          setSavedSessions(bills.slice(1));
        } else {
          setActiveSession(null);
          setSavedSessions([]);
        }
        setIsLoading(false);
      },
```

With:
```typescript
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const bills = snapshot.docs
          .map(doc => ({ id: doc.id, ...doc.data() } as Bill))
          .filter(b => b.status !== 'draft' || b.ownerId === user.uid);

        if (bills.length > 0) {
          setActiveSession(bills[0]);
          setSavedSessions(bills.slice(1));
        } else {
          setActiveSession(null);
          setSavedSessions([]);
        }
        setIsLoading(false);
      },
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npm run build
```

Expected: no TypeScript errors.

- [ ] **Step 3: Manual smoke test**

Start the dev server:
```bash
npm run dev
```

1. Sign in as a user who is a participant on another user's bill that is currently in draft (i.e., the other user opened the wizard but hasn't clicked Done).
2. Open the dashboard. The draft bill should NOT appear.
3. Sign in as the bill owner. The draft bill SHOULD still appear as the active session.

- [ ] **Step 4: Commit**

```bash
git add src/hooks/useBills.ts
git commit -m "fix: hide other users' draft bills from dashboard"
```

---

## Task 2: Filter draft bills from the event detail view

**Files:**
- Modify: `src/pages/EventDetailView.tsx:295-297`

- [ ] **Step 1: Apply the filter in the subscription callback**

In `src/pages/EventDetailView.tsx`, find the `subscribeBillsByEvent` call (lines 294–297). `user` is already in scope at line 210 via `const { user } = useAuth()`.

Replace:
```typescript
    // Subscribe to bills
    const unsubscribeBills = billService.subscribeBillsByEvent(eventId, (bills) => {
      setEventBills(bills);
    });
```

With:
```typescript
    // Subscribe to bills
    const unsubscribeBills = billService.subscribeBillsByEvent(eventId, (bills) => {
      setEventBills(bills.filter(b => b.status !== 'draft' || b.ownerId === user?.uid));
    });
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npm run build
```

Expected: no TypeScript errors.

- [ ] **Step 3: Manual smoke test**

1. User A creates an event and invites User B.
2. User A opens the bill wizard inside the event but does NOT click Done (bill stays draft).
3. User B opens the event detail view. The in-progress bill should NOT appear in the bills list.
4. User A clicks Done. User B refreshes the event detail view. The bill NOW appears.

- [ ] **Step 4: Commit**

```bash
git add src/pages/EventDetailView.tsx
git commit -m "fix: hide other users' draft bills from event detail view"
```

---

## Task 3: Enforce draft visibility at the Firestore security rules level

**Files:**
- Modify: `firestore.rules:66-136`

- [ ] **Step 1: Add `isNotDraft()` helper and tighten the read rule**

In `firestore.rules`, find the `// ========== Bills Collection Helper Functions ==========` section (around line 66) and the `allow read` block inside `match /bills/{billId}` (around line 121).

Add the helper function after the existing helpers (after line 115, before the READ comment):

```javascript
      // Draft bills are readable only by their owner
      function isNotDraft() {
        return resource.data.status != 'draft';
      }
```

Then replace the entire `allow read` block:

Old:
```javascript
      allow read: if 
        // Anonymous users can read bills with valid share codes
        hasValidShareCode() ||
        // Authenticated users follow normal rules
        (request.auth != null && (
          // Owner can always read
          request.auth.uid == resource.data.ownerId ||
          // Linked participant via participantIds (null-safe for pre-migration bills)
          ('participantIds' in resource.data && request.auth.uid in resource.data.participantIds) ||
          // Event members can read event bills
          hasEventIdAndMember(resource.data) ||
          // Squad members can read squad bills
          hasSquadIdAndMember(resource.data) ||
          // Legacy: authenticated members can read (includes guests who joined via share link)
          isBillMember(resource.data)
        ));
```

New:
```javascript
      allow read: if 
        // Anonymous users can read bills with valid share codes (non-draft only)
        (isNotDraft() && hasValidShareCode()) ||
        // Authenticated users follow normal rules
        (request.auth != null && (
          // Owner can always read, including their own drafts
          request.auth.uid == resource.data.ownerId ||
          // All non-owner paths: only non-draft bills are accessible
          (isNotDraft() && (
            // Linked participant via participantIds (null-safe for pre-migration bills)
            ('participantIds' in resource.data && request.auth.uid in resource.data.participantIds) ||
            // Event members can read event bills
            hasEventIdAndMember(resource.data) ||
            // Squad members can read squad bills
            hasSquadIdAndMember(resource.data) ||
            // Legacy: authenticated members can read (includes guests who joined via share link)
            isBillMember(resource.data)
          ))
        ));
```

- [ ] **Step 2: Deploy the updated rules**

```bash
firebase deploy --only firestore:rules
```

Expected output includes:
```
✔  firestore: released rules firestore.rules to cloud.firestore
```

- [ ] **Step 3: Manual smoke test**

Repeat the event smoke test from Task 2, Step 3. This time, also verify via the Firebase console (Firestore → Rules playground) that a read of a draft bill by a non-owner returns `false`.

- [ ] **Step 4: Commit**

```bash
git add firestore.rules
git commit -m "fix: enforce draft bill owner-only read in Firestore security rules"
```
