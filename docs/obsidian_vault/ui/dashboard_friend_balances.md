---
title: Dashboard — Friend Balances Card
date: 2026-02-21
tags: [ui, dashboard, balances, friend_balances]
---

# Dashboard — Friend Balances Card

The **Friend Balances** card on the dashboard gives users a quick, at-a-glance summary of all outstanding balances with their friends, without needing to navigate to Settings.

## Component

`FriendBalancePreviewCard.tsx`

## Data Source

Reads from `user.friends[]` in the **[Users](../database/users.md)** collection — the denormalized cache that is kept in sync with the **[[../database/friend_balances|friend_balances]]** ledger.

Because `useUserProfile` uses a Firestore `onSnapshot` real-time listener, this card **updates automatically** whenever:
- A bill is finalized (balances added).
- A bill is deleted (balances reversed).
- The other user in a pair updates something.

## Display Logic

Each friend with a non-zero balance is shown as a row:

| State           | Display                                                       |
| --------------- | ------------------------------------------------------------- |
| Friend owes you | Friend's name + **"Owes you"** in black + amount in **green** |
| You owe friend  | Friend's name + **"You owe"** in black + amount in **red**    |
| Settled (zero)  | Friend's name + **"Settled"** in muted text                   |
|                 |                                                               |

Friends with a zero balance may be shown or hidden depending on the display configuration.

## Empty State

If the user has no friends with outstanding balances (or no friends at all), the card shows an appropriate empty state with a prompt to add friends or create a bill.

## Relationship to Friend Balances Architecture

```
Bill finalized
    └── applyBillBalances()
            └── runTransaction on friend_balances doc
                    └── recalculateAllFriendBalances()
                            └── updateDoc(userRef, { friends: [...] })
                                    └── onSnapshot fires on useUserProfile
                                            └── FriendBalancePreviewCard re-renders ✓
```

## Related

- [[../database/friend_balances|friend_balances]] — The shared ledger powering these numbers
- [[manage_friends]] — Where friends are added/managed
- [[settings]] — Parent page of the Friends tab
