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

## 4. Dependencies
- `VenmoChargeDialog.tsx`: The modal that actually facilitates the deep link or API call to Venmo.
- `ProfileSettings.tsx`: Invoked dynamically if the user is missing prerequisite profile data.
