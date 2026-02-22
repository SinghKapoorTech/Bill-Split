---
title: Manage Friends Tab
date: 2026-02-21
tags: [ui, friends, settings, search, balances]
---

# Manage Friends Tab

The "Friends" tab (accessed via Settings) allows users to manage their personal address book of friends for bill splitting. It also displays the **live balance** owed between you and each friend, powered by the **[[friend_balances]]** shared ledger.

## Overview

Users can add friends two ways:
1. **Global Search** — find existing app users by email or username.
2. **Manual Entry** — add a friend who isn't on the app yet (creates a Shadow User).

![[Add_Friends.png]]

---

## Balance Display

Each friend row shows:
- **Owes you** (green amount) — the friend has a net debt to you.
- **You owe** (red amount) — you have a net debt to the friend.
- **Settled** (muted) — the balance is zero.

These values are read from the `user.friends[].balance` cache field, which is kept in sync with the **[[friend_balances]]** shared ledger automatically whenever a bill is finalized or deleted.

> [!NOTE]
> The balance updates in real-time via Firestore's `onSnapshot` listener on the user profile document. No page reload is needed after completing a bill.

---

## 1. Global User Search

Searches the application's user database for existing accounts.

- **By email** (exact match): Enter a complete email to find a specific user.
- **By username** (prefix): Type 2+ characters to search by username handle.

Results display the user's name, username, and email. Clicking a result adds them to your friends list instantly using their real Firebase UID as the link.

### Adding from Search

When a user is added from search results, `recalculateSingleFriendBalance()` is called in the background to immediately pull any pre-existing balance from the **[[friend_balances]]** collection (e.g., if they already created bills involving you before you added them).

---

## 2. Manual Entry (Shadow Users)

For friends who don't have an account yet.

**Required fields:**
- **Name** — display name.
- **Email** — used to create or find a Shadow User document in Firestore.

**Optional fields:**
- **Venmo ID** — enables direct payment link generation.

On save, `userService.resolveUser(email, name)` is called:
1. If a `users` document with that email already exists → returns its UID.
2. If not → creates a new Shadow User with `isShadow: true`.

The resulting UID is stored in your `friends` list so that if the person ever signs up, their account inherits all linked bill history.

---

## User Interface Breakdown

### Search Input
- At the top of the card, with a search icon.
- Results appear in a floating popover (z-indexed above card content).
- Each result renders as a hoverable card showing name, username/email.

### Manual Add Section
- Below an "OR" divider.
- Name and Email fields (both required to enable the save button).
- Optional Venmo ID field.
- "Save External Friend" button (disabled until name + email filled).

### Saved Friends List
A scrollable list of all saved friends:
- **Name** displayed prominently.
- **Username** or **email** shown in smaller text below the name.
- **Balance** shown on the right: "Owes you $X.XX" (green), "You owe $X.XX" (red), or "Settled" (muted).
- **Edit** (pencil icon) — opens inline edit for name, email, Venmo ID.
- **Delete** (trash icon) — removes the friend from your list. Does **not** delete the `friend_balances` document (outstanding balances are preserved).

---

## Related

- [[friend_balances]] — Database schema for the shared ledger
- [[settings]] — Parent settings page
- [[search]] — Detailed search implementation docs
