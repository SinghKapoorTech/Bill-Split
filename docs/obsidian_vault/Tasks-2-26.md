---
title: Bill Split App – Product Backlog
date: 2026-02-26
owner: Aakaash
tags: [backlog, bugs, features, ui, obsidian]
---

# ✅ Backlog (Single File)

> [!tip] How to use
> - Check the box when done.
> - Add notes under any item.
> - Optional: add a date like `✅ 2026-02-26` at the end when complete.

## Legend
- **P0** = must-fix / blocks core flows  
- **P1** = important / high impact  
- **P2** = nice-to-have

---

## 🔥 P0 — Critical Bugs / Core Functionality

- [x] **(P0) Add person manually is not working**  
  _Bug:_ shows “need name” even when a name exists.  
  **Acceptance:** user can add person with name reliably; no false validation errors.

- [ ] **(P0) Saving a friend (heart icon) fails**  
  _Bug:_ “insufficient permission” error.  
  **Acceptance:** heart save works; correct permissions + error handling.

- [ ] **(P0) Simple transaction UI resets back to normal bill UI**  
  _Bug:_ created correctly, but returning to UI shows normal bill UI.  
  **Acceptance:** simple transaction stays in simple transaction UI state on revisit.

- [ ] **(P0) Ledger not updating when adding new friend**  
  _Bug:_ needs to walk existing transactions between two individuals and rebuild ledger.  
  **Acceptance:** after adding friend, balances reflect historical transactions correctly.

- [ ] **(P0) “Settle Up” in an event too slow**  
  _Bug:_ performance regression.  
  **Acceptance:** settle-up completes within acceptable time; UI stays responsive.

- [ ] **(P0) “Settle Up” in an event doesn’t update friend balances properly**  
  _Bug:_ balances out of sync after event settlement.  
  **Acceptance:** friend balances reflect settlements immediately + accurately.

- [ ] **(P0) Events & bills must be bi-directional visibility**  
  _Bug:_ if I create event + add person, that person must see the event too.  
  **Acceptance:** added users can see event, associated bills, and their balances.

- [ ] **(P0) Users should NOT see “Mark as Settle” on their own UI**  
  _Bug:_ button visibility rules wrong.  
  **Acceptance:** shown only when user owes someone or someone owes user (correct side only).

---

## 🚀 P1 — Features (High Impact)

- [ ] **(P1) Settlement History + Undo Settlement (Unsettle all related bills)**  
  **Acceptance:** settlement history list; undo reverses all linked bill states and ledgers.

- [ ] **(P1) Paid Status Indicator (Green/Yellow/Red)**  
  - 🟩 fully settled  
  - 🟨 partially settled  
  - 🟥 not settled  
  **Acceptance:** consistent indicator on bills + event views; derived from ledger state.

- [ ] **(P1) “Create your first bill” should give options**  
  **Acceptance:** first-time CTA offers choices (e.g., Bill / Simple Transaction / Event Bill).

- [ ] **(P1) When creating an event, prompt to add users + add “first bill” buttons**  
  **Acceptance:** event wizard includes user add step; post-create shows quick actions.

- [ ] **(P1) Any bill wizard should allow associating with an event**  
  **Acceptance:** event selection/assignment exists in wizard; can assign later too.

- [ ] **(P1) Simple bill/transaction should be mergeable into an event**  
  **Acceptance:** can assign existing bill to event; event & bill views update both ways.

- [ ] **(P1) “My Bills” should be an expandable list (show 5 initially)**  
  **Acceptance:** shows first 5 + “Expand List” to reveal all; smooth UX.

---

## 🎛️ P1 — UX / UI Changes

- [ ] **(P1) Add a friend should be a dialog (not inline UI)**  
  **Acceptance:** reduces clutter; dialog has validation + clear actions.

- [ ] **(P1) Friend balances list behavior**  
  - Show up to **5** friends initially  
  - Button: **“Expand List”** to show the rest  
  - “Manage Friends” button should exist but placed more thoughtfully  
  **Acceptance:** clean default view; expands predictably.

---

## 🧹 P2 — Removals / Cleanups

- [ ] **(P2) Remove “MY FRIENDS” title under Manage Friends**  
  **Acceptance:** page reads clean without redundant header.

- [ ] **(P2) Manage Friends: remove your icon (only show friend icon)**  
  **Acceptance:** no double icons; consistent visuals.

- [ ] **(P2) Remove Cancel button from “Settle Up” dialog**  
  **Acceptance:** dialog still has a clear close mechanism (X or outside click), if intended.

---

## 🏡 Phase2 (Not Required)

- [ ] **(P2/Optional) Airbnb/House day-based expense**  
  **Acceptance:** per-day split support (date range → daily cost allocation).

---
