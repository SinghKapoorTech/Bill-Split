---
title: Bill-Split Add People Flow
date: 2026-02-20
tags: [architecture, ui, feature, people-manager, bill-split]
---

# Add People Functionality in Bill-Split

This document outlines the UI architecture, user flows, and component structure for adding people to a bill in the Bill-Split application. This primarily happens during the "People Step" of the Bill Wizard.

## 1. Overview
The "Add People" flow is designed to be highly flexible, catering to different scenarios: adding a new user from scratch, quickly selecting a saved friend, or importing an entire group (a Squad) at once. The central orchestrator for this is the `PeopleManager` component.

![[Add_Person.png]]
## 2. Core Components & Layout

### `PeopleStep.tsx`
This is the top-level container for this phase of the wizard. 
- **Responsive Design**: On desktop, it utilizes a `TwoColumnLayout` (receipt preview on the left, people manager on the right). On mobile, it uses a compact vertical layout, showing a small thumbnail of the receipt at the top if one was uploaded.
- **State Management**: It passes down the list of `people`, the active `billData`, and all the handler functions (add, remove, update) to the `PeopleManager`.

### `PeopleManager.tsx`
The central hub for managing the bill's participants. 

At the top of the manager, three primary actions are presented to the user:
1. **Add Person (Primary Button)**: Opens the `AddPersonDialog`. This is the main entry point for searching global users or adding a manual guest (detailed in the [Search Architecture](search.md)).
2. **Friends (Outline Button)**: Opens the `AddFromFriendsDialog`.
3. **Squads (Outline Button)**: Opens the `AddFromSquadDialog`.

Below the buttons, the active list of selected people is rendered using `PersonCard` components.

## 3. The Three Addition Methods

### Method 1: The "Add Person" Dialog
*Handled by `AddPersonDialog.tsx`*
- Explored in detail in the [Search Architecture](search.md).
- Allows global search by email or username (queries the **[users](../database/users.md)** collection).
- Fallback for entering a guest manually (just name and optional Venmo ID).

### Method 2: The "Friends" Dialog
*Handled by `AddFromFriendsDialog.tsx`*
- **Purpose**: Quick access to frequently split-with people.
- **Data Source**: Fetches the `friends` array directly from the current user's Firestore document.
- **UI**: Presents a clean list of saved friends. Each row has the friend's name, Venmo handle, and an "Add" button. If the user has no friends saved, it provides an empty state encouraging them to save people.

### Method 3: The "Squads" Dialog
*Handled by `AddFromSquadDialog.tsx`*
- **Purpose**: For recurring group events (e.g., roommates, event squads). Allows adding multiple people simultaneously. (See **[squads schema](../database/squads.md)**).
- **Data Source**: Uses the `useSquadManager` hook to load the user's saved squads.
- **Flow**:
  1. **Search/List**: The user sees a list of their squads with a search bar to filter by name. Each squad shows its member count.
  2. **Preview Mode**: Clicking a squad doesn't instantly add them. Instead, it transitions to a preview showing all individual members within that squad.
  3. **Confirmation**: The user confirms by clicking "Add Squad to Bill", injecting all unique members into the current bill.

## 4. Post-Addition Features

Once people are added to the list:
- **`PersonCard.tsx`**: Each person is displayed in a card. The current user is highlighted as "You". Users can click to edit details, remove them, or click "Save as Friend" if they aren't already in the friends list.
- **`SaveAsSquadButton.tsx`**: Located at the bottom of the list. If multiple people are present, this convenient button allows the user to take the current lineup and instantly save it as a new reusable Squad.
- **Deduplication**: The system ensures (via ID checking) that the same person/friend/squad member isn't added twice. The logged-in user is always guaranteed to be on the bill.
