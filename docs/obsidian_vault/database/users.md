---
title: Users Collection Schema
date: 2026-02-21
tags: [database, schema, firestore, users]
---

# `users` Collection

The `users` collection is the central hub for all identity and profile information in the application. It uses the Firebase Auth `uid` as the document ID, ensuring a 1:1 mapping between authentication records and application profiles.

## Document ID
String — matches the Firebase Auth `uid`.

## Schema (`UserProfile`)

| Field         | Type              | Description                                                                           |
| ------------- | ----------------- | ------------------------------------------------------------------------------------- |
| `uid`         | String            | The unique user identifier (matches Document ID).                                     |
| `email`       | String            | User's email address.                                                                 |
| `displayName` | String            | Full name displayed in the UI.                                                        |
| `username`    | String (Optional) | Auto-generated unique handle (e.g., `john_doe_1`).                                   |
| `photoURL`    | String (Optional) | URL to the user's avatar.                                                             |
| `phoneNumber` | String (Optional) | User's phone number.                                                                  |
| `venmoId`     | String (Optional) | User's Venmo handle for payments (without the `@`).                                   |
| `friends`     | Array of String   | Firebase UIDs of saved friends. Balances are stored separately in **[[friend_balances]]**, not here. |
| `squadIds`    | Array of String   | IDs referencing documents in the **[Squads](squads.md)** collection.                  |
| `createdAt`   | Timestamp         | When the profile was created.                                                         |
| `lastLoginAt` | Timestamp         | Last time the user authenticated.                                                     |
| `isShadow`    | Boolean (Optional)| Flags if this user was implicitly created via contact info before they signed up.     |

### The `friends` Array

`friends: string[]` — a plain array of Firebase UIDs representing the user's saved friends.

> [!NOTE]
> There is **no balance data** embedded in this array. Balances live exclusively in the **[[friend_balances]]** collection. `userService.getHydratedFriends(userId)` queries both `users` (for names/emails/venmoId) and `friend_balances` (for balance amounts) at read time to construct the full `Friend[]` displayed in the UI.

## Relationships & Usage

- **[[friend_balances]]**: Source of truth for balance amounts. `friends[]` here just says *who* your friends are, not *how much* they owe.
- **[Squads](squads.md)**: The `squadIds` array is a two-way sync. When a user joins or creates a Squad, its ID is appended here.
- **[Bills](bills.md)**: `friends[]` is used during bill finalization to resolve bill-local person IDs to real Firebase UIDs.

## Shadow Users

If User A adds User B (who hasn't installed the app) by email, the system calls `resolveUser()` to find or create a User document for them.
- It contains their contact info and `isShadow: true`.
- When User B eventually signs up, their auth flow resolves to this existing shadow UID, inheriting all their linked history.

## Real-Time Listener

The `useUserProfile` hook uses a Firestore `onSnapshot` real-time listener (not a one-time `getDoc`). This means any write to the user document — including balance cache updates from `friendBalanceService` — is reflected instantly in the UI across all open tabs/windows.
