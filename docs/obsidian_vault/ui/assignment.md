---
title: Bill-Split Assignment Flow
date: 2026-02-20
tags: [architecture, ui, feature, assignment, bill-split]
---

# Assignment Functionality in Bill-Split

This document outlines the UI architecture and component structure for Step 3 of the Bill Wizard: the **Assignment** phase.

## 1. Overview
The "Assignment" step is where the core logic of the app shines. Users link the physical items parsed from the receipt (Step 1) to the people participating in the bill (Step 2).

The primary orchestrator for this step is `AssignmentStep.tsx`.

## 2. Core Components & Layout

### `AssignmentStep.tsx`
This parent component manages the layout and provides conditional rendering based on the device, similar to the other steps.

- **AI Processing Overlay**: If the AI receipt parsing from Step 1 is somehow still running in the background when the user reaches this step, it displays a full-screen `Loader2` overlay preventing assignment until the item data is ready.
- **Desktop Layout**: Uses `TwoColumnLayout` (receipt on the left, interactive assignment area on the right).
- **Mobile Layout**: Stacks the receipt preview thumbnail above the interactive assignment area.

### `BillItems.tsx` (Reused)
Interestingly, this step heavily reuses the exact same `BillItems.tsx` component that was used in **Step 1: Bill Entry**. However, because it's now armed with `people` and `itemAssignments` data props, the rendered UI within those items changes dramatically.

#### Assignment Logic Display
Within the `BillItemCard` or `BillItemsTable` (depending on screen size), each line item now renders an assignment interface:
- A horizontal list of avatars/initials representing the participants.
- Users tap/click a person to assign or unassign them from that specific item.
- The UI actively visually splits the item's cost based on how many people are currently selected.

## 3. The "Split Evenly" Action
A prominent feature of this step is the global "Split Evenly" (or "Assign All") toggle.
- When activated, a helper function (`onToggleSplitEvenly`) iterates through every existing line item and fully assigns the entire currently selected `people` array to each item.
- This creates an atomic Firestore update (modifying `itemAssignments` in the **[bills](../database/bills.md)** collection) ensuring the entire group is synced simultaneously.
- If a user manually adjusts a single item *after* clicking "Split Evenly", the global flag is disabled, seamlessly transitioning them back to manual assignment mode without losing their other split data.
