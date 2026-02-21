---
title: Friends Tab Search and Shadow Users
date: 2026-02-21
tags: [ui, friends, settings, search]
---

# Manage Friends Tab Documentation

The "Friends" tab, typically accessed via the Settings page, allows users to manage their personal list of friends for easy access when splitting bills or forming squads.

## Overview
Users can add friends using two distinct methods:
1. **Global Search for App Users**
2. **Manual Entry (Shadow Users)**
![[Add_Friends.png]]

## 1. Global User Search
Users can search the application's global database to find existing users.
- **Search Parameters**: Users can be searched by their exact **email address** or by a prefix match on their **username**.
- **Suggestions**: As the user types (minimum 2 characters for usernames), a debounced request searches the database. A scrollable dropdown displays the matching results with their name, username, and an avatar.
- **Adding from Search**: Clicking a user in the dropdown directly adds them to the saved friends list. The connection is made using their canonical unique `id`.

## 2. Manual Entry and Shadow Users
For friends who do not yet have an account on the application, a manual entry method is provided.

- **Required Fields**: 
  - **Name**: The display name for the friend.
  - **Email**: Required to create a "Shadow User". This ensures that if the friend signs up for the app later using this email, their newly created account is automatically linked to the friends list and bills they were a part of.
- **Optional Fields**:
  - **Venmo ID**: Useful for generating exact charge links.

When saved, a query is run to ensure a user with that email doesn't already exist. If it doesn't, a new user document is created with the `isShadow: true` flag in the Firestore database.

## User Interface Breakdown

### Search Users Input
- Located at the top of the card.
- A search icon is prominently displayed on the left of the input field.
- Results appear in an absolute-positioned, visually distinct popover component overlapping the rest of the card safely using z-indexes.

### Add External Friend Manually
- Standard input fields (Name, Email, Venmo URL).
- Separated by an "OR" divider text label to clearly demarcate the two options.
- Includes a primary button: "Save External Friend". The button remains disabled until BOTH the Name and Email fields have inputs.

### Saved Friends List
Displays a list of previously saved friends in an elegant, scrollable list.
- Each item displays the friend's name prominently.
- It will also display either the `@username` or the email address, depending on what kind of friend link it is.
- Actions: Users have the ability to click the pencil icon to **Edit** the details or the trash icon to **Delete** the friend entirely from the list.



