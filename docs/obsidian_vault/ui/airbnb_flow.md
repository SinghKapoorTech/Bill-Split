---
title: Airbnb Flow
date: 2026-03-09
tags: [ui, airbnb, flow, wizard]
---

# Airbnb Flow

The Airbnb Flow is a specialized wizard dedicated to splitting costs for Airbnb trips, vacations, or general house-sharing expenses. Unlike the generic [[bill_entry|Bill Entry]] flow, which focuses on items and taxes, the Airbnb flow is tailored around dates, total cost, and specific guests.

## The Approach

The user can choose between two main methodologies to split the trip:
1. **Split Evenly:** Divides the total cost equally among all guests for the entire duration. This is the simplest and default approach.
2. **Split by Night:** Allows assigning specific guests to specific nights, useful when guests arrive late or leave early.

## The Wizard Steps

### 1. Trip Details (`AirbnbEntryStep`)
- **Action:** Select check-in and check-out dates via a calendar picker. Enter the base total cost of the stay.
- **Additional Fees:** Users can add dynamic supplementary fees (e.g., Cleaning Fee, Service Fee). By default, the trip starts with no fees pre-populated.
- **Validation:** Requires dates to be selected and a positive total cost before advancing.

### 2. Guests (`AirbnbGuestsStep`)
- **Action:** Specify who is attending the trip.
- **Integration:** Uses `PeopleStepBase` with `InlinePersonSearch` — the same people-adding experience as the Standard bill wizard:
  - Type a name → select a friend from the dropdown or click "Add [name] as guest"
  - Friends list quick-add button
  - Squads quick-add button
  - Each person shown as a `PersonCard` with Friend/Venmo options
- **Event Support:** Features an Event Selector in the top right, allowing users to attach the trip to a specific event.
- **Validation:** At least one guest must be added before proceeding.

### 3. Split Method (`AirbnbSplitMethodStep`)
- **Action:** The core decision point. Presents two large, glassmorphic cards to select either "Split Evenly" (Default) or "Split by Night".
- **Logic Sync:** If "Split Evenly" is chosen, the system automatically assigns every night and every fee to every guest in the background, allowing the user to seamlessly advance to the final review.

### 4. Assign Nights (`AirbnbAssignStep`)
- **Condition:** Only shown if the user selected **Split by Night**.
- **Action:** A minimalistic UI listing every single night (e.g., "Night of Mar 1", "Night of Mar 2") and fee. Users toggle which guests stayed on which specific night.
- **Validation:** Every single night and every fee must be assigned to at least one guest before advancing.

### 5. Review & Finish (`AirbnbReviewStep`)
- **Action:** Summarizes the grand total and each individual's customized share based on the selected method.
- **Component:** Leverages the generic `SplitSummary` component used in regular bills.
- **Settlement:** Each person row shows a compact **Settle** button. When clicked, the row shows a green **Settled** badge and an **Undo Settle** option — consistent with the standard bill Review step.
- **Venmo:** Direct "Charge on Venmo" / "Pay on Venmo" deep links per person based on their role (creditor or debtor).
- The bottom navigation bar provides **Back** and **Done** actions.
