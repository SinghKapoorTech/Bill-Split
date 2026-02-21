---
title: Settings Tab
date: 2026-02-21
tags: [ui, settings, profile, friends]
---

# Settings Tab

The Settings Tab provides users with a centralized location to configure their personal profile and manage their connections with other users.

## Navigation
Users can access the Settings tab via the main navigation (e.g., bottom navigation bar on mobile or sidebar on desktop).

## Key Components

The Settings view is separated into two primary sub-tabs:

### 1. Profile Setup (`ProfileSettingsCard.tsx`)
This section allows users to manage their own personal identity on the platform.
- **Display Name**: How the user appears to others in bills and squads.
- **Venmo ID**: The user's Venmo handle. Storing this allows other users to directly pay them for their share of a split bill.
- **Email/Phone**: Contact information used for login and linking "shadow" accounts.

### 2. Friends Management (`ManageFriendsCard.tsx`)
This section is heavily interlinked with the core network features of the app. It provides an interface to save, search for, and curate an address book of friends for faster bill splitting.
- **Search App Users**: Instantly lookup other users registered on the platform.
- **Manual "Shadow" Users**: Add friends who aren't on the app yet by their email.

For detailed documentation on the Friends Management flow and how search works, refer to the dedicated [[manage_friends]] documentation.
