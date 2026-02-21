---
title: Users Collection Schema
date: 2026-02-20
tags: [database, schema, firestore, users]
---

# `users` Collection

The `users` collection is the central hub for all identity and profile information in the Bill-Split application. It uses the Firebase Auth `uid` as the document ID, ensuring a 1:1 mapping between authentication records and application profiles.

## Document ID
String - Matches the Firebase Auth `uid`.

## Schema (`UserProfile`)

| Field | Type | Description |
|-------|------|-------------|
| `uid` | String | The unique user identifier (matches Document ID). |
| `email` | String | User's email address. |
| `displayName` | String | Full name displayed in the UI. |
| `username` | String | Auto-generated unique handle (e.g., `john_doe_1`). |
| `photoURL` | String (Optional) | URL to the user's avatar. |
| `phoneNumber` | String (Optional) | User's phone number. |
| `venmoId` | String (Optional) | User's Venmo handle for payments (without the `@`). |
| `friends` | Array of Object | List of saved friends for quick access (see below). |
| `squadIds` | Array of String | IDs referencing documents in the **[Squads](squads.md)** collection. |
| `createdAt` | Timestamp | When the profile was created. |
| `lastLoginAt` | Timestamp | Last time the user authenticated. |
| `isShadow` | Boolean (Optional) | Flags if this user was implicitly created via contact info before they signed up. |

### The `friends` Sub-Object
Instead of full relationships, friends are currently stored as denormalized objects directly on the user for fast rendering in the "Add Person" UI.
- `name` (String)
- `venmoId` (String, Optional)

## Relationships & Usage
- **[Squads](squads.md)**: The `squadIds` array acts as a two-way sync. When a user joins or creates a Squad, its ID is appended here so the dashboard can query their squads efficiently.
- **[Bills](bills.md)**: User and Shadow User IDs are stored in the `members` array of a Bill document when they participate.

## Shadow Users
If User A adds User B to a squad using *only* User B's phone number or email (before User B has ever downloaded the app), the system generates a "Shadow User" in this collection.
- It contains their contact info and `isShadow: true`.
- If User B eventually signs up with that same phone/email, the auth flow resolves to this existing shadow UID, adopting all their historical squad/bill history seamlessly.
