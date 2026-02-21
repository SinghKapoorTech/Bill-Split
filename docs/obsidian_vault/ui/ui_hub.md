---
title: UI Hub Overview
date: 2026-02-21
tags: [ui, overview, architecture]
---

# User Interface Hub

Welcome to the UI Hub. This document serves as the high-level map of all user-facing flows and interfaces documented in this vault. Divit is an AI-powered bill splitting application, and its UI is structured around core flows: entering bill details, selecting people, assigning items, and reviewing the outcome.

## Core Bill Splitting Flow
The main user journey of the app follows a wizard-like sequence:
1. **[[bill_entry|Bill Entry]]**: The starting point. Users input the receipt details, either manually or via OCR reading.
2. **[[add_people|Add People]]**: Specifying who is participating in the bill. Users can add guests, select from their saved friends, or import an entire squad.
3. **[[assignment|Item Assignment]]**: The interactive step where receipt line items are assigned to specific people.
4. **[[review|Review & Split]]**: The final summary screen showing the calculated totals for each person (Subtotal, Tax, Tip).
5. **[[full_bill_view|Full Bill View]]**: A detailed, read-only view of a completed bill.

## Network & Connectivity
How users find and connect with each other.
- **[[search|User Search]]**: The underlying mechanism for finding users globally.
- **[[settings|Settings Tab]]**: Profile configuration.
- **[[manage_friends|Manage Friends]]**: Curating a personal list of friends and creating "Shadow Users" for easy access during the Add People step.

## Navigating the Documentation
Each link above points to a dedicated markdown file that breaks down the UI components, data flows, and specific feature capabilities of that interface.
