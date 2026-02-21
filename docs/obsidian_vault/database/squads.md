---
title: Squads Collection Schema
date: 2026-02-20
tags: [database, schema, firestore, squads]
---

# `squads` Collection

The `squads` collection manages recurring groups of friends who frequently split bills together (e.g., "Roommates", "Trip to Cabo"). Squads are designed to be lightweight and easily imported into a new Bill.

## Document ID
Custom ID generated via `generateSquadId()` (e.g., UUID).

## Schema (`Squad` / `FirestoreSquad`)

| Field | Type | Description |
|-------|------|-------------|
| `id` | String | The document ID. |
| `name` | String | Display name of the squad. |
| `description` | String (Optional) | Context for the squad. |
| `memberIds` | Array of String | Array of UID references to the **[Users](users.md)** collection. |
| `createdAt` | Timestamp | Creation time. |
| `updatedAt` | Timestamp | Last modification time. |

## Hydration Architecture
Notice that the database *only* stores `memberIds`. It does not store names, emails, or Venmo IDs in the squad document itself. 

When a squad is fetched for the UI via `fetchUserSquads`, the application performs a "hydration" step. It maps over the `memberIds`, fetches the corresponding profile from the **[Users](users.md)** collection, and constructs a `HydratedSquad` object in memory. This ensures that if a user updates their Venmo ID, all squads they belong to instantly reflect the new ID without needing to update every squad document.

## Two-Way Sync Relationship
There is a strict two-way data sync between Squads and Users:
- A `Squad` document contains an array of `memberIds`.
- A `User` document contains an array of `squadIds`.

When a squad is created or updated, Firestore `writeBatch` operations are used to simultaneously update the `Squad` document and iterate through every affiliated user in the **[Users](users.md)** collection, appending or removing the `squadId` from their profiles. This allows the dashboard to efficiently query "What squads am I in?" simply by looking at the user's personal `squadIds` array.
