---
title: Settings Tab
date: 2026-02-21
tags: [ui, settings, profile, friends, balances]
---

# Settings Tab

The Settings Tab is the central location for managing your personal profile and your relationships with other users (including friend balances).

## Navigation

Accessible via the main bottom navigation bar (mobile) or sidebar (desktop), tapping the Settings icon.

## Key Components

The Settings view is split into two primary sub-tabs:

---

### 1. Profile Setup (`ProfileSettingsCard.tsx`)

Manage your own personal identity on the platform.

| Field          | Description                                                                               |
| -------------- | ----------------------------------------------------------------------------------------- |
| **Display Name** | How you appear to others in bills and squads.                                           |
| **Venmo ID**   | Your Venmo handle (stored without `@`). Displayed with `@` in all UI surfaces. Enables direct payment link generation for bill splits. |
| **Email/Phone** | Contact info used for login and linking shadow accounts.                                 |

---

### 2. Friends Management (`ManageFriendsCard.tsx`)

Interface to curate your friends list and view what each person owes you (or vice versa).

- **Live Balances**: Each friend row shows the net balance from the **[[friend_balances]]** shared ledger — "Owes you $X", "You owe $X", or "Settled".
- **Search App Users**: Find any registered user by email or username prefix.
- **Shadow Users**: Add friends not on the app yet by providing their name + email.

This tab is the primary place where your friends list is managed. Adding a friend here is what "links" them to balance tracking — only people in your friends list will have their balances updated when you finalize a bill.

For detailed documentation on the full flow, refer to [[manage_friends]].
