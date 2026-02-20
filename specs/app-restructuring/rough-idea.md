# App Restructuring: Bills, Trips, Squads

## Rough Idea

Complete app restructuring with three core entities:

1. **Bills** - Individual/singular bills (standalone). The atomic unit -- a single receipt/expense that gets split among people.

2. **Events (Trips)** - A collection of individual bills all related to the same trip/event. Multiple users can add bills to the same trip. Think: "Weekend in Vegas" with 5 different restaurant bills from different people.

3. **Squads** - Persistent groups of the same people. Squads can have trips AND individual bills associated with them. Think: "College Friends" squad that goes on multiple trips together and also splits one-off bills.

## Hierarchy

- Squad -> has many Trips + has many standalone Bills
- Trip -> has many Bills
- Bill -> can exist standalone, within a Trip, or within a Squad directly

## Context

This replaces the current schema which has:
- `users/{userId}` - User profiles with friends[], squadIds[]
- `bills/{billId}` - All bills (private + group) with billType discriminator
- `squads/{squadId}` - Squad documents with memberIds[]
- `groups/{groupId}` - Multi-receipt events (being replaced by Trips)
- `groupInvitations/{invitationId}` - Email invitations
