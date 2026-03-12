---
title: UI Hub Overview
date: 2026-03-09
tags: [ui, overview, architecture]
---

# User Interface Hub

Welcome to the UI Hub. This document serves as the high-level map of all user-facing flows and interfaces documented in this vault. Divit is an AI-powered bill splitting application, and its UI is structured around core flows: entering bill details, selecting people, assigning items, and reviewing the outcome.

## Core Bill Splitting Flow
The main user journey of the app follows a wizard-like sequence:
1. **[[bill_entry|Bill Entry]]**: The starting point. Users input the receipt details, either manually or via OCR reading.
2. **[[add_people|Add People]]**: Specifying who is participating in the bill. Uses `InlinePersonSearch` as the primary entry point — type a name, select a friend, or add as guest inline.
3. **[[assignment|Item Assignment]]**: The interactive step where receipt line items are assigned to specific people.
4. **[[review|Review & Split]]**: The final summary screen showing the calculated totals for each person. Includes compact Settle/Undo buttons per person.
5. **[[full_bill_view|Full Bill View]]**: A detailed, read-only view of a completed bill.

## Bill Types
Three bill creation paths are available from the Dashboard:
- **Standard** (`/bill/new`) — Full 4-step wizard: entry → people → assignment → review.
- **Quick** (`/transaction/new`) — Simplified "who owes who" single-step transaction.
- **House / Airbnb** (`/airbnb/new`) — [[airbnb_flow|Airbnb Flow]]: specialized wizard for stay dates, nightly cost, fees, and guest assignments.

## Network & Connectivity
How users find, connect with, and track balances with each other.
- **[[search|User Search]]**: The underlying mechanism for finding users globally.
- **[[settings|Settings Tab]]**: Profile configuration.
- **[[manage_friends|Manage Friends]]**: Curating a personal list of friends, viewing balances, and creating "Shadow Users" for easy access during the Add People step.
- **[[dashboard_balances|Dashboard Balance Card]]**: At-a-glance balance summary on the dashboard, powered by the [[../database/balances|balances]] shared ledger.

## Testing
- **[[../testing/e2e_testing|E2E Testing Guide]]**: How to run Playwright end-to-end tests with Firebase Emulators. Covers setup, running tests, troubleshooting, and writing new tests.

## Navigating the Documentation
Each link above points to a dedicated markdown file that breaks down the UI components, data flows, and specific feature capabilities of that interface.
