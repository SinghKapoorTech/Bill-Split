---
title: Bill-Split Bill Entry Flow
date: 2026-02-20
tags: [architecture, ui, feature, bill-entry, bill-split]
---

# Bill Entry Functionality in Bill-Split

This document outlines the UI architecture, user flows, and component structure for the first major step of the application: the **Bill Entry** phase.

## 1. Overview
The "Bill Entry" step is the starting point for users after initiating a new bill split. It provides two distinct ways to input bill items: 
- **AI Scan**: Uploading an image of a receipt for automatic parsing.
- **Manual Entry**: Manually adding item names and prices.

The primary component orchestrating this is `BillEntryStep.tsx`.

## 2. Core Components & Layout

### `BillEntryStep.tsx`
This is the top-level container for Step 1 of the Bill Wizard. It manages the layout dynamically based on the user's device.

#### Desktop Layout
Uses the `TwoColumnLayout` component:
- **Left Column (Sticky)**: Displays the `ReceiptUploader`. This component handles drag-and-drop, file selection, and provides visual feedback during uploading and AI analysis.
- **Right Column (Scrollable)**: Displays the `BillItems` tracking interface. It reads from the `billData` state.

#### Mobile Layout
Uses a vertical stack with a custom `TabSelector`:
- **Tabs**: Users toggle between an "AI Scan" tab (showing the `ReceiptUploader`) and a "Manual" tab (showing the `BillItems`).
- **Auto-Switching**: When a receipt is successfully uploaded and analyzed, the mobile view automatically (after a brief 400ms delay) switches from the "AI Scan" tab to the "Manual" tab so the user can immediately review the extracted items.

### `BillItems.tsx`
This component is responsible for rendering the actual list of line items, but it delegates the visual representation to sub-components based on screen size:
- **Desktop**: Renders `BillItemsTable`, presenting items in a clean, spreadsheet-like format suitable for wider screens.
- **Mobile**: Renders `BillItemCard`, presenting each item as an individual, touch-friendly card.

## 3. The Entry Methods

### Method 1: Receipt Upload (AI Scan)
*Handled by `ReceiptUploader.tsx` (and `useFileUpload` hook)*
- **User Action**: The user can drag & drop an image or open the file picker.
- **Data Flow**: The selected image file is passed up to the parent via `onImageSelected`.
- **Processing State**: The UI provides feedback via `isUploading` and `isAnalyzing` flags, typically rendering spinners or loading messages while the AI extracts the items.

### Method 2: Manual Item Management
*Handled by `useItemEditor.ts` hook passed into `BillItems.tsx`*
- **Adding**: Users can click "Add Item" to reveal an inline form (name and price).
- **Editing**: Clicking on an existing item shifts it into an editable state, allowing quick corrections (invaluable for fixing minor AI extraction errors).
- **Deleting**: Individual items can be permanently removed from the bill.

## 4. Nuances & State Handling
- **Draft/Memory State**: When navigated to via `/bill/new`, this entire step operates `isDraft === true`. No database document exists yet. The background save engine (`useBillSession`) strictly monitors this step and will quietly generate a real Firebase document (silently swapping the URL to `/bill/{id}`) the moment the user transitions to the next step, ensuring empty sessions are never saved.
- **Subtotal & Summary**: The `BillSummary` component sits at the bottom of the items list. While it primarily calculates totals in later steps, its presence here helps users verify that the total matches their physical receipt.
- **Item Assignment Prep**: While not the primary focus of this step, `BillEntryStep` prepares the data structure so that the items created here can later have people assigned to them.
- **Responsive Fluidity**: The aggressive separation of desktop vs. mobile experiences (table vs. cards, side-by-side vs. tabs) ensures that the complex task of entering financial data doesn't feel cramped on a phone or overly sparse on a monitor.
