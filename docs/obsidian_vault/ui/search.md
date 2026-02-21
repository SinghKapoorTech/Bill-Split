---
title: Bill-Split Search Architecture
date: 2026-02-20
tags: [architecture, search, feature, bill-split]
---

# Search Functionality in Bill-Split

This document outlines the architecture, data flow, and UI implementation of the user search functionality in the Bill-Split application.

## 1. Overview
The search feature allows users to find and add other app users to their bills. It operates primarily within the `AddPersonDialog` component, triggered from the `PeopleManager`. It seamlessly blends local friend searches with global user database queries.

## 2. Core Components

### `PeopleManager.tsx`
This acts as the orchestrator for the search logic. It maintains the `friends` list (loaded from the user's Firestore profile) and handles the search input state (`newPersonName`).

#### Search Logic Flow
1. **Input Detection**: As the user types, `PeopleManager` first filters the local `friends` array based on a simple substring match (`name.toLowerCase().includes(searchInput)`).
2. **Global Query Trigger**: If the input resembles an email address (`^[^\s@]+@[^\s@]+\.[^\s@]+$`) OR is at least 2 characters long, it initiates a global search via `userService`.
3. **Deduplication & Aggregation**: The results from the global search are compared against the local friends list and the current logged-in user. Any new global users are appended to the `filteredFriends` list, which is then passed to the UI.

### `AddPersonDialog.tsx`
Handles the immediate UI for the search input and the display of results.

- **Dropdown Interface**: A sleek dropdown appears below the input if suggestions are found.
- **Card-like Results**: Each search result is rendered as a distinct, clickable card with hover effects.
- **Visual Indicators**: Results display name, username, Venmo ID (with an `@` icon), and email (with a mail icon) if available.
- **Empty State**: If a global search is triggered but returns no matches, a specific "No users found" message is displayed, guiding the user to manually add a guest.

### `userService.ts`
The backend service handling Firestore interactions for global searches.

- `getUserByContact(contact: string)`: 
  - Tries to find an exact match by `email`.
  - If no email match, tries to find an exact match by `phoneNumber`.
  - Returns a single `UserProfile` or `null`.
- `searchUsersByUsername(queryStr: string)`:
  - Normalizes the input.
  - Performs a Firestore prefix query on the `username` field.
  - Uses the pattern: `where('username', '>=', query)` and `where('username', '<=', query + '\uf8ff')`.
  - Limited to returning a maximum of 5 results to ensure efficiency.

## 3. Data Models

The search primarily deals with the `UserProfile` data structure:
```typescript
interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  phoneNumber?: string;
  username: string;
  // ... other fields
}
```

When displaying results, it maps this to a `Friend` interface for the UI components:
```typescript
interface Friend {
  id?: string;
  name: string;
  venmoId?: string;
  email?: string;
  username?: string;
}
```

## 4. Nuances & Edge Cases handled
- **Debounce Simulation**: `PeopleManager.tsx` uses a simple boolean flag (`isActive`) within the `useEffect` cleanup function to ignore stale responses if the user types rapidly.
- **Self-Exclusion**: The current logged-in user is explicitly filtered out from the global search results to prevent them from adding themselves again.
- **Guest Fallback**: If a user cannot be found, the system smoothly falls back to a "Manual Entry" mode where the search input is auto-filled as the guest's name.
