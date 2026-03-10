---
title: Bill-Split Add People Flow
date: 2026-03-09
tags: [architecture, ui, feature, people-manager, bill-split, inline-search]
---

# Add People Functionality in Bill-Split

This document outlines the UI architecture, user flows, and component structure for adding people to a bill in the Bill-Split application. This primarily happens during the "People Step" of the Bill Wizard.

## 1. Overview

The "Add People" flow uses an **inline search experience** as its primary entry point. Instead of a separate dialog, users type directly into an `InlinePersonSearch` input embedded in the step. The system searches saved friends first, then falls back to adding the typed name as a guest. Additional methods (Friends list, Squads) are available as supplementary actions below the search bar.

## 2. Core Components & Layout

### `PeopleStep.tsx`
The top-level container for this phase of the wizard.
- **Responsive Design**: On desktop, uses a `TwoColumnLayout` (receipt preview left, people manager right). On mobile, uses a compact vertical layout with a receipt thumbnail at the top.
- **Event Dropdown**: Located in the `StepHeader` next to the "People" title. The `EventSelector` allows users to assign the bill to an event and auto-import its members.
- **State Management**: Passes `people`, `billData`, and handler functions (add, remove, update) down to `PeopleStepBase`.

### `PeopleStepBase.tsx`
The shared base used by both the Standard wizard and the Airbnb wizard Guests step.
- **`InlinePersonSearch`**: The primary search input. Sits at the top of the people section.
- **Friend / Squad quick-add buttons**: Below the search bar, secondary action buttons to open `AddFromFriendsDialog` and `AddFromSquadDialog`.
- **`PersonCard` list**: The active participants are rendered below as `PersonCard` components.

### `InlinePersonSearch.tsx`
The core UI component for adding people.
- **Placeholder**: `"Add a friend or guest..."`
- **Search behavior**: As the user types, it queries the user's saved friends by name and shows a live dropdown. If no friend match is found, the dropdown shows an **"Add [name] as guest"** option.
- **Adding a guest**: The user either clicks the "Add [name] as guest" row in the dropdown **or** presses `Enter` with a non-matching name. This creates a minimal `Person` object with just the typed name.
- **Adding a friend**: Clicking a matched friend row adds them with their full profile (name, Venmo handle, userId).
- **Recent people**: Also surfaces recently split-with people derived from past bills.

## 3. The Addition Methods

### Method 1: Inline Search (Primary)
*Handled by `InlinePersonSearch.tsx`*

The default flow:
1. User types into `"Add a friend or guest..."` input
2. Live friend search results appear in a dropdown
3. Clicking a friend row → adds them to the bill
4. No match? → `Add "Alice" as guest` row appears
5. Clicking it (or pressing `Enter`) → adds a guest with just their name

### Method 2: Friends Dialog (Secondary)
*Handled by `AddFromFriendsDialog.tsx`*
- Quick access to the full friends list without typing.
- Each row has the friend's name, Venmo handle, and an "Add" button.

### Method 3: Squads Dialog (Secondary)
*Handled by `AddFromSquadDialog.tsx`*
- For recurring groups (e.g., roommates, regular squads). Adds multiple people at once.
- Flow: Browse squads → Preview members → Confirm with "Add Squad to Bill".
- See **[squads schema](../database/squads.md)**.

### Method 4: Event Assignment
*Handled by `EventSelector.tsx` within the Step Header*
- Selecting an event fetches all members (via `fetchEventMembers`) and overrides the current people list.
- Behind the scenes, sets `billType: 'event'` and tags the bill with `eventId`.
- Selecting "None (Private Bill)" reverts to a standard private state.

## 4. Post-Addition Features

Once people are added to the list:
- **`PersonCard.tsx`**: Each person displayed in a card. The current user is highlighted as "You". Users can edit details, remove them, or click "Save as Friend" (heart icon) if not already in the friends list.
  - **Friend Status**: Automatically identifies saved friends via userId or name matching.
  - **Shadow Users**: When saving a manually added guest as a friend, `usePeopleManager.ts` calls `userService.createShadowUser` to generate a real userId before saving to the `friends` array.
- **`SaveAsSquadButton.tsx`**: At the bottom of the list. Saves the current lineup as a new reusable Squad.
- **Deduplication**: The system checks IDs to prevent adding the same person twice. The logged-in user is always on the bill.
