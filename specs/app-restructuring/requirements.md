# Requirements: App Restructuring

## Questions and Answers

(Questions will be appended as they are asked and answered.)

---

### Q1: Bill Ownership vs. Trip/Squad Membership

**Question**: If Alice creates a Trip under the "College Friends" Squad and Bob (a Squad member) adds a bill to that Trip, who can edit/delete Bob's bill?

**Options**:
- **A**: Only the bill creator (Bob's bill is Bob's)
- **B**: Any Trip member (open collaborative model)
- **C**: Tiered (creator edits content, members edit assignments, owner can delete)

**Answer**: Option B -- Any Trip member can edit any bill in that Trip. Open collaborative model.

---

### Q2: Bill Mobility -- Can bills move between contexts?

**Question**: Can a bill be moved after creation? E.g., a standalone bill gets attached to a Trip later, or a Trip bill gets detached to become standalone.

**Options**:
- **A**: Bills are fixed in their context once created
- **B**: Bills can move freely between contexts (standalone, trip, squad)
- **C**: One-way -- bills can be added to a context but not removed

**Answer**: Option B -- Bills can move freely between contexts. Full flexibility.

---

### Q3: Squad membership and Trip access -- Revised understanding

**Original Question**: If a Trip belongs to a Squad, does Squad membership automatically grant Trip access?

**User Clarification**: The Vegas Trip would only show up in the Trip section, NOT as part of the Squad/Group. This changes the mental model significantly.

**Revised Understanding Presented to User**:

The three entities may be more independent than originally described:

- **Squads** = persistent rosters of people (like "College Friends"). A contact group / template for quickly populating members.
- **Trips** = standalone events with their own member lists and bills. Not nested under Squads.
- **Bills** = individual expenses that can be standalone or part of a Trip.

A Squad would serve as a convenience to quickly populate a Trip's member list (like a template), but Trips do not "belong to" a Squad in any hierarchical sense. There is no Squad -> Trip ownership or nesting.

**Question to user**: Is this revised understanding correct? Specifically:
1. Squads are purely a people-roster / convenience feature, not a container for Trips or Bills?
2. Trips are fully independent entities with their own member lists?
3. The only relationship between a Squad and a Trip is that you can use a Squad to quickly add members when creating a Trip?
4. Bills can be standalone or inside a Trip, but never "inside a Squad" directly?

**Answer**: INCORRECT. Major correction from user. The revised model is below.

---

### Q3b: Corrected Entity Model (Three Pages)

**User provided the definitive model:**

**Page 1: Bills (standalone)**
- Individual one-off bills. Create, split, done.

**Page 2: Trips**
- Create a trip, add people to it. Those people can add bills to the trip.
- A trip is a self-contained event with multiple bills.
- Trips can exist independently OR be attached to a Squad.

**Page 3: Squads**
- Persistent groups like roommates.
- Squads CONTAIN Trips and standalone Bills (organizational + financial container).
- KEY FEATURE: Running balance / settle-up. Instead of charging per bill, you accumulate charges over time and settle up periodically. Can mark bills up to last payment as "settled."
- Splitwise-style balance tracking for the group.

**Confirmed hierarchy:**
- Squad -> contains Trips + standalone Bills -> running balance / settle-up
- Trip -> contains Bills -> can exist independently OR be part of a Squad
- Bill -> atomic unit -> standalone, in a Trip, or in a Squad

---

### Q4: How does settling up work?

**Question**: What are the mechanics of the settle-up feature?

**User clarification 1**: Trips ALSO have the running tab / settle-up feature, not just Squads. Both Trips and Squads accumulate balances and support settling up.

**User clarification 2**: Settlement model is a hybrid:

1. The app **optimizes debts** (minimizes number of payments -- e.g., "Carol, just pay Alice $40" instead of multiple separate payments).
2. When the user presses "Settle Up," all bills up until that point are marked as settled. Everything after starts fresh (timestamp marker).
3. In ALL bills (standalone, trip, squad), users can **mark any individual payment as settled** (e.g., Bob marks his $20 to Alice as paid).
4. Individual settled payments are **taken into account when optimizing debts** -- already-paid amounts are subtracted from the optimization calculation.

**Full settle-up flow**:
1. Calculate who owes whom across all unsettled bills
2. Subtract any individual payments already marked as settled
3. Optimize remaining debts to minimize transactions
4. When "Settle Up" is pressed, mark all current bills as settled (timestamp marker)

---

### Q5: Granularity of individual payment tracking

**Question**: When a user marks an individual payment as settled on a bill, what is being recorded?

**Options**:
- **A**: Per-debt settlement -- directed debts ("Bob owes Alice $30") tracked and marked paid/unpaid
- **B**: Per-person-per-bill flag -- simple boolean on the bill ("Bob: settled = true")
- **C**: Payment records -- separate payments collection with full audit trail (partial payments, multi-bill payments, who paid whom and how much)

**Answer**: Option C -- Payment records. A separate "payments" collection with full audit trail. Supports partial payments, payments spanning multiple bills, links to specific bills, tracks who paid whom and how much.

---

### Q6: People identity -- authenticated users vs. named placeholders

**Question**: For balance tracking and settle-up to work, people need stable identities across bills. How should people be identified?

**Options**:
- **A**: All Squad/Trip members must be authenticated users (Splitwise model)
- **B**: Mixed -- authenticated users + invited-by-contact members with shadow profiles that merge on sign-up
- **C**: Name-based matching (fragile, breaks on typos)

**Answer**: Option B -- Mixed model. Authenticated users + invited members with shadow profiles. Shadow profiles merge with real accounts when the invited person signs up.

---

### Q7: What happens to balances when a bill moves between contexts?

**Question**: Bills can move freely (Q2) and both Trips and Squads track running balances (Q4). When a bill moves from one context to another, what happens to the balances?

**Options**:
- **A**: Balances follow the bill (recalculated on move, removed from old context, added to new)
- **B**: Balances are computed dynamically, not stored. Moving a bill just changes its reference fields. No restriction on moving settled bills.
- **C**: Option B but with a restriction: settled bills cannot be moved (protects settlement history)

**Recommendation**: B + C (dynamic computation, but block moving settled bills)

**Answer**: Option B only -- Balances computed dynamically, no stored balance fields. Full flexibility to move any bill including settled ones. No restrictions.

**Design implication**: Settlement records must snapshot which bill IDs were included at settlement time. This way, even if a bill is later moved to a different context, the historical settlement record remains intact and self-contained. The settlement is a point-in-time record, not a live query.

---

### Q8: How do share links work in the new model?

**Question**: Does each entity type have its own sharing/invitation mechanism, or is there a unified approach?

**Options**:
- **A**: Unified share codes for all three entity types
- **B**: Tiered -- Bills keep lightweight anonymous share codes; Trips and Squads require authenticated membership (join via invite or share link that requires sign-in)
- **C**: Invite-only for Trips/Squads, share codes only for standalone Bills

**Answer**: Option B -- Tiered sharing. Bills keep lightweight anonymous share codes (current behavior). Trips and Squads require authenticated membership via invite or share link that requires sign-in.

---

## Summary of All Decisions

| # | Topic | Decision |
|---|-------|----------|
| Q1 | Bill permissions | Any Trip member can edit any bill in that Trip (open collaborative) |
| Q2 | Bill mobility | Bills can move freely between all contexts |
| Q3 | Entity model | Three pages: Bills (standalone), Trips (events with bills), Squads (persistent groups with running tabs) |
| Q4 | Settle-up model | Debt optimization + "Settle Up" marks all bills to that point + individual payments factored in |
| Q5 | Payment tracking | Separate payments collection with full audit trail |
| Q6 | People identity | Mixed authenticated + shadow profiles that merge on sign-up |
| Q7 | Balance computation | Computed dynamically, never stored. Settlements snapshot bill IDs. |
| Q8 | Sharing | Tiered: anonymous share codes for Bills, authenticated membership for Trips/Squads |
