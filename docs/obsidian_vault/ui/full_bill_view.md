---
title: Full Bill View (Collaborative Session)
date: 2026-02-20
tags: [architecture, ui, feature, bill-wizard, bill-split]
---

# Full Bill View: The Collaborative Session

This document outlines the architecture of the main interactive core of the Bill-Split application: the collaborative session where bills are actually parsed, split, and reviewed.

## 1. Overview
The "Full Bill View" isn't a single page, but rather a complex, stateful wizard orchestrated by a few key components. The primary entry point for this experience is `CollaborativeSessionView.tsx`. 

This view handles two very different user experiences:
1. **The Host (Owner)**: The user who created the bill. They get the full `BillWizard` experience to upload receipts, add friends, and manage the flow.
2. **The Guest (Participant)**: Someone who joined via a link. They are presented with a simplified `GuestClaimView` where they can only claim items they owe for in real-time.

## 2. Core Orchestrators

### `CollaborativeSessionView.tsx`
This acts as the master container for the entire routing endpoint `/session/:sessionId`.
- **Real-time Sync**: It utilizes the `useBillSession` hook to establish a WebSocket connection to the Firebase document. Every change made by any user triggers an update here.
- **State Management**: It maintains the master local copies of `billData`, `people`, `itemAssignments`, and `splitEvenly`. 
- **Optimistic UI**: When a user performs an action (like assigning an item), this component updates the local state *instantly* via optimistic updates, making the app feel incredibly fast, while firing off the atomic update to Firebase in the background.

### `BillWizard.tsx`
If the current user is the "Owner", the view renders the `BillWizard`.
This component is tasked with guiding the user through the 4 critical phases of splitting a bill. It uses a clean, swipeable (on mobile) step-by-step progress interface.

## 3. The 4-Step Wizard Flow

The bill splitting process is broken down into four distinct, logical steps, each with its own detailed documentation:

- **[Step 1: Bill Entry](bill_entry.md)**
  - Users scan a receipt via AI or manually type in the items on their tab.
- **[Step 2: Add People](add_people.md)**
  - Users invite friends to join the bill. Features a robust global search, quick-add from friends lists, or squad imports. (See also: [Search Architecture](search.md)).
- **[Step 3: Assignment](assignment.md)**
  - The core user action: tapping on names to link participants to specific items, or using the global "Split Evenly" function.
- **[Step 4: Review & Complete](review.md)**
  - The final summary screen showing calculated totals (items + tax + tip) per person, featuring deep integration with Venmo for instant payment requests.

## 4. Mobile First Approach
The entire full bill view was designed with a mobile-first philosophy:
- Navigation utilizes a compact `PillProgress` bar on smaller screens.
- The entire step container `SwipeableStepContainer` supports fluid, gesture-based swiping left and right to move between the 4 steps without reaching for navigation buttons.
- A fixed bottom bar `WizardNavigation` ensures actions like "Next" or "Done" are always a thumb-reach away.
