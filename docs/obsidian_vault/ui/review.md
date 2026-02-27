---
title: Bill-Split Review Flow
date: 2026-02-20
tags: [architecture, ui, feature, review, venmo, bill-split]
---

# Review & Complete Functionality in Bill-Split

This document outlines the UI architecture, user flows, and component structure for the final step of the Bill Wizard: the **Review & Complete** phase.

## 1. Overview
The "Review" step is where users finalize the bill splitting process. It presents a comprehensive breakdown of what every person owes, factoring in items, tax, and tip. The core value proposition of this step is its seamless integration with Venmo, allowing the user to immediately request money from the participants.

## 2. Core Components & Layout

### `ReviewStep.tsx`
This acting as the orchestration wrapper for Step 4 of the Bill Wizard.
- **Responsiveness**: It primarily ensures the UI flows nicely on both desktop and mobile. 
- **Receipt Thumbnail**: On mobile devices, if a receipt was uploaded in Step 1, it renders a small `StepHeader` showing a thumbnail of the receipt, allowing users to cross-reference the digital split with the physical bill one last time.
- **Delegation**: The actual complex logic of displaying totals and handling interactions is delegated to the `SplitSummary` component.

### `SplitSummary.tsx`
This is the workhorse of the Review phase. 

#### Validation Check
Before rendering the totals, it enforces a strict rule `if (!allItemsAssigned)`. If the user arrives at this step but forgot to assign a line item from Step 2, it halts the UI and displays a prominent warning: "Please assign all items before proceeding to review."

#### The Totals Grid
If validation passes, it renders a responsive grid (1 column on mobile, 2 columns on desktop) of cards. Each card represents a `PersonTotal` and displays:
- **Name**: Using an abbreviated format (e.g., "John D.") via `getAbbreviatedNames()`.
- **Breakdown**: A clear list showing subtotal for items, tax, tip, and the final grand total.

## 3. The Venmo Integration

The standout feature of `SplitSummary` is the "Charge on Venmo" functionality. 

### Conditional Rendering
The "Charge on Venmo" button is meticulously conditionally rendered for each person:
- It requires the user to be logged in (`user` exists).
- It explicitly **hides** the button on the card belonging to the logged-in user (checked via `isCurrentUser()`). You can't charge yourself!

### The Charge Flow (`handleChargeOnVenmo`)
When the button is clicked, a multi-step validation occurs:
1. **Auth Check**: If the user isn't logged in, a toast error prompts them to sign in.
2. **Venmo ID Check**: It checks if the logged-in user has set up their *own* Venmo ID in their profile. If not, it halts the charge and immediately opens the `ProfileSettings` dialog so they can set it up.
3. **Execution**: If everything is valid, it generates a smart description string and opens the `VenmoChargeDialog`.

### Smart Descriptions (`generateItemDescription`)
Instead of just saying "Money for dinner", the app automatically generates an itemized note for the Venmo request.
- It scans `itemAssignments` to see exactly what that specific person ordered.
- If multiple people shared an item, it appends a note: `"(split X ways)"`.
- Example Output: `Divit: Burger, Fries (split 2 ways), Coke`

## 4. Automatic Ledger Updates

The Review step no longer manages complex ledger math directly. Under the new **Server-Side Pipeline** architecture, the client's only responsibility is to save the `Bill` document to Firestore.

### How it works

1. When a bill is created, edited, or reviewed, the app simply saves the state of the bill document to the `bills` collection.
2. The backend **`ledgerProcessor` Cloud Function** instantly detects the write via an `onDocumentWritten` trigger.
3. The server-side pipeline securely validates the bill, computes exact per-person totals, and atomically updates the authoritative **[[../database/friend_balances|friend_balances]]** ledger.
4. The pipeline then automatically rebuilds the `event_balances` cache for the associated event.

### Why this is better
- **No Client Race Conditions:** Users can immediately tap "Charge on Venmo" and close the app. The backend guarantees the ledger completely updates regardless of the user's connection status.
- **Security:** The app doesn't need to write to `friend_balances`, locking down the database from malicious client updates.

## 5. Dependencies

- `VenmoChargeDialog.tsx`: The modal that facilitates the deep link or API call to Venmo.
- `ProfileSettings.tsx`: Invoked dynamically if the user is missing prerequisite profile data.

## 6. Mark as Settled Flow

On the review page or the collaborative session view, the person who created the bill can manually check off users to mark their portion of the bill as "Settled".

### User Interface Interaction
- **Active State:** When marked as settled, the user's card background turns green and displays a checkmark.
- **Toggle Action:** Tapping the card triggers `handleMarkAsSettled(personId, isSettled)`.

### How the Pipeline Handles It
- Marking a person as settled simply pushes their `personId` into the `settledPersonIds` array on the Firestore bill document.
- The backend `ledgerProcessor` Cloud Function detects this modification and re-runs.
- Because they are now in the `settledPersonIds` array, the server calculates their debt on the bill as `$0`.
- The server reverses their old footprint and safely applies the new `$0` footprint to the global ledger, instantly marking them paid without any complex client-side logic.
