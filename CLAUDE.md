# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Bill Split is a React + TypeScript application that uses AI to analyze receipts and fairly split bills among friends with Venmo integration. The app supports both AI-powered receipt scanning and manual bill creation, collaborative group events with multiple receipts, and saved friend groups (Squads).

**Live deployment:** https://bill-split-lemon.vercel.app

### Core Features

- **AI Receipt Scanning** - Gemini AI extracts items, prices, tax, and tip from receipt images
- **Fair Bill Splitting** - Proportional tax/tip distribution with flexible item assignment
- **Dashboard** - Manage multiple bills with automatic save/resume functionality
- **Groups** - Create collaborative events with multiple receipts from different people
- **Squads** - Save frequent friend groups for faster bill creation
- **Shareable Links** - Send bills to friends (no app download required)
- **Venmo Integration** - Send payment requests with itemized descriptions

## Getting Started

When starting work on this project, use the `/init` command to:
1. Install all dependencies (`npm install`)
2. Start the development server (`npm run dev`)

This ensures the environment is properly set up before making changes.

## Development Commands

```bash
# Start development server (http://localhost:8080)
npm run dev

# Build for production
npm run build

# Build for development (with sourcemaps)
npm run build:dev

# Run linter
npm run lint

# Preview production build locally
npm preview
```

## Architecture

### State Management Pattern

The app uses a **custom hooks architecture** where each major feature domain has its own hook that manages related state and logic:

**Bill Management:**
- **`useBills`** - Manages user's bill sessions (CRUD, real-time updates, receipt images)
- **`useBillSession`** - Manages individual bill session state and Firestore sync
- **`useBillSplitter`** - Core bill state (billData, itemAssignments, calculations)
- **`useItemEditor`** - Item editing/adding state (edit mode, add mode, validation)

**People & Social:**
- **`usePeopleManager`** - People state (adding, removing, friends list)
- **`useUserProfile`** - User profile and Firestore operations
- **`useFriendsEditor`** - Friend list management
- **`useSquadManager`** - Manages saved friend groups (Squads)
- **`useSquadEditor`** - Squad creation/editing UI state

**Events & Collaboration:**
- **`useEventManager`** - Multi-receipt event CRUD and membership
- **`useEventBills`** - Bills within events (subscribe, create, update, delete)
- **`useEventInvites`** - Event invitation system
- **`useEventLedger`** - Event balance data from per-pair balance docs (real-time)
- **`useShareSession`** - Shareable link generation

**Settlements & Balances:**
- **`useFriendsEditor`** - Friend list management with hydrated balances from `friend_balances`

**AI & Media:**
- **`useReceiptAnalyzer`** - Gemini AI integration for receipt analysis
- **`useFileUpload`** - File upload and image preview state
- **`useImagePicker`** - Platform-specific image selection

**Contexts:**
- **`BillSessionContext`** - Provides `useBills` functionality app-wide (wraps bill pages)
- **`AuthContext`** - Firebase authentication (wraps entire app)

These hooks are composed together in pages and components.

### Data Flow

**Individual Bills:**
1. **Bill Creation**: Dashboard → Create New Bill → `billService.createBill()` → Navigate to `/bill/:id`
2. **Receipt Analysis**: User uploads receipt → Gemini AI analyzes → `setBillData()` → Firestore auto-sync
3. **Manual Entry**: User clicks "Add Item" → `addItem()` → Updates bill → Firestore auto-sync
4. **Item Assignment**: User clicks person badges → `handleItemAssignment()` → Updates `itemAssignments` state → Firestore auto-sync
5. **Calculations**: `itemAssignments` + `billData` → `calculatePersonTotals()` → Proportional tax/tip distribution
6. **Venmo Charges**: Person total + assigned items → `generateItemDescription()` → Venmo deep link with itemized note
7. **Session Management**: Bills auto-save → Dashboard lists all bills → Resume/delete functionality

**Events (Multi-Receipt Groups):**
1. **Event Creation**: User creates event → `useEventManager.createEvent()` → Firestore `events` collection
2. **Multiple Bills**: Event members add receipts → Each bill has `eventId` → Per-pair balance tracking
3. **Balance Pipeline**: Bill changes trigger `ledgerProcessor` → Updates `friend_balances` (Stage 2) and `event_balances` per-pair docs (Stage 3) via idempotent deltas
4. **Event Settlement**: User settles within event → `processEventSettlement` Cloud Function → Only settles bills in that event → Flow-through updates `friend_balances` automatically
5. **Sharing**: Event owner invites members by email → Members view/contribute

**Squads:**
1. **Squad Creation**: Settings → Squads tab → Add squad with members → Firestore
2. **Quick Add**: Bill page → Add people → "Add from Squad" → Auto-populate names/venmoIds

### Responsive Design Strategy

The app has distinct mobile (<768px) and desktop (≥768px) views:

- **Desktop**: Table-based layout (`BillItemsTable`) with dropdown or badge assignment modes
- **Mobile**: Card-based layout (`BillItemCard`) with badge-only assignment mode
- **Component switching**: `BillItems.tsx` checks `useIsMobile()` and renders appropriate component

### Firebase Integration

The app uses Firebase for authentication, database, and storage.

#### Firebase Configuration (`src/config/firebase.ts`)

```typescript
// Initialized services:
- auth: Firebase Authentication (with Capacitor support for native apps)
- db: Firestore Database
- storage: Cloud Storage
- functions: Cloud Functions
- analytics: Analytics
- googleProvider: Google OAuth provider with account selection
```

Environment variables required (see `.env`):
- `VITE_FIREBASE_API_KEY`
- `VITE_FIREBASE_AUTH_DOMAIN`
- `VITE_FIREBASE_PROJECT_ID`
- `VITE_FIREBASE_STORAGE_BUCKET`
- `VITE_FIREBASE_MESSAGING_SENDER_ID`
- `VITE_FIREBASE_APP_ID`

#### Firestore Database Structure

```
users/{userId}/                          # User profiles
  - venmoId: string                      # User's Venmo handle
  - friends: [                           # Array of friend objects
      { name: string, venmoId?: string }
    ]
  - squads: [                            # Array of saved friend groups
      {
        id: string,
        name: string,
        description?: string,
        members: [{ name: string, venmoId?: string }],
        createdAt: timestamp,
        updatedAt: timestamp
      }
    ]

bills/{billId}/                          # All bills (private + event)
  - id: string
  - billType: 'private' | 'event'
  - ownerId: string                      # User who created the bill
  - eventId?: string                     # If billType is 'event'
  - paidById?: string                    # Overrides creditor (simple transactions)
  - billData: {
      items: [{ id, name, price }],
      subtotal: number,
      tax: number,
      tip: number,
      total: number,
      restaurantName?: string
    }
  - people: [{ id, name, venmoId? }]     # People splitting the bill
  - itemAssignments: {                   # Item-to-person mapping
      [itemId]: [personId, personId, ...]
    }
  - splitEvenly: boolean
  - settledPersonIds?: string[]          # Bill-local person IDs who have paid
  - processedBalances?: Record<uid, number>  # Last footprint written to friend_balances
  - processedEventBalances?: Record<uid, number>  # Last footprint written to event_balances
  - _ledgerVersion?: number              # Incremented by pipeline each pass
  - _friendScanTrigger?: timestamp       # Touched to re-trigger pipeline on friend add
  - participantIds?: string[]            # Firebase UIDs of all linked participants
  - unsettledParticipantIds?: string[]   # UIDs removed as people settle
  - members: [{                          # Authenticated users with access
      userId: string,
      name: string,
      email?: string,
      joinedAt: timestamp,
      isAnonymous: boolean
    }]
  - createdAt: timestamp
  - updatedAt: timestamp
  - lastActivity: timestamp
  - receiptImageUrl?: string             # Cloud Storage URL
  - receiptFileName?: string             # Storage file name
  - shareCode?: string                   # 6-char code (e.g., "XY3K9P")
  - shareCodeCreatedAt?: timestamp
  - shareCodeExpiresAt?: timestamp       # 7 days from creation
  - shareCodeCreatedBy?: userId

events/{eventId}/                        # Multi-receipt events
  - name: string
  - description?: string
  - ownerId: string
  - memberIds: [userId, ...]             # Event members
  - pendingInvites?: [email, ...]        # Pending email invitations
  - createdAt: timestamp
  - updatedAt: timestamp

friend_balances/{uid1_uid2}/             # Bilateral balance between two friends
  - id: string                           # Sorted composite: [uid1, uid2].sort().join('_')
  - participants: [uid1, uid2]           # Sorted alphabetically
  - balance: number                      # >0 → participants[0] is owed; <0 → participants[1] is owed
  - unsettledBillIds: string[]           # Bill IDs contributing to this balance
  - lastUpdatedAt: timestamp
  - lastBillId: string

event_balances/{eventId_uid1_uid2}/      # Per-pair balance within an event (mirrors friend_balances)
  - id: string                           # "{eventId}_{sorted uid pair}"
  - eventId: string
  - participants: [uid1, uid2]           # Sorted alphabetically
  - balance: number                      # Same sign convention as friend_balances
  - unsettledBillIds: string[]           # Bill IDs from this event between this pair
  - lastUpdatedAt: timestamp
  - lastBillId: string

settlements/{settlementId}/              # Immutable settlement records
  - id: string
  - fromUserId: string                   # Debtor
  - toUserId: string                     # Creditor
  - amount: number
  - settledBillIds: string[]
  - eventId?: string                     # Present if event-scoped settlement
  - date: timestamp

eventInvitations/{invitationId}/         # Email invitations
  - email: string
  - eventId: string
  - invitedBy: userId
  - status: 'pending' | 'accepted' | 'declined'
  - createdAt: timestamp
```

#### Cloud Storage Structure

```
receipts/{userId}/{fileName}             # Private receipt images
  - Access: Owner only (authenticated)
  - Used for: Private bills

receipts/collaborative/{fileName}        # Shared receipt images
  - Access: Public (for anonymous sharing)
  - Used for: Collaborative sessions
```

#### Firestore Security Rules (`firestore.rules`)

**Users Collection:**
- Users can only read/write their own document (`/users/{userId}`)

**Bills Collection:**
- **Read**: Owner, event members (for event bills), or authenticated members (via share link)
- **Create**: Authenticated users only, must set themselves as owner
- **Update**:
  - Owner has full access
  - Event members have full access (for event bills)
  - Authenticated members can update limited fields (itemAssignments, people, lastActivity)
- **Delete**: Owner only

**Events Collection:**
- **Read**: Owner, members, or invited users (via email)
- **Create**: Authenticated users only, must set themselves as owner and member
- **Update**: Owner has full access; members can update specific fields (memberIds, pendingInvites)
- **Delete**: Owner only

**Friend Balances & Event Balances Collections:**
- **Read**: Only participants (via `participants` array-contains)
- **Write**: Admin SDK only (server-side pipeline)

**Settlements Collection:**
- **Read**: From/to user, or event members (if event settlement)
- **Create**: From/to user only
- **Update**: Immutable (blocked)
- **Delete**: From/to user only

**Storage Rules (`storage.rules`):**
- Users can read/write their own receipts: `/receipts/{userId}/**`
- Public access for collaborative receipts: `/receipts/collaborative/**`

#### Database Services & Operations

**Bill Service (`src/services/billService.ts`):**
- `createBill()` - Creates new bill document with default values
- `getBill(billId)` - Fetches single bill by ID
- `updateBill(billId, updates)` - Updates bill (auto-adds `updatedAt` and `lastActivity`)
- `getBillByShareCode(code)` - Looks up bill by 6-character share code
- `joinBill(billId, userId, userName)` - Adds user to bill's members array
- `generateShareCode(billId, userId)` - Creates/returns 6-char code (expires in 7 days)

**Squad Service (`src/services/squadService.ts`):**
- `fetchUserSquads(userId)` - Gets all squads from user document
- `saveSquad(userId, input)` - Appends new squad to user's squads array
- `updateSquad(userId, squadId, updates)` - Updates specific squad
- `deleteSquad(userId, squadId)` - Removes squad from array
- `getSquadById(userId, squadId)` - Fetches single squad

**Settlement Service (`src/services/settlementService.ts`):**
- `requestSettlement(friendUserId)` - Settles ALL unsettled bills with a friend (calls `processSettlement` Cloud Function)
- `requestEventSettlement(eventId, friendUserId)` - Settles bills within a specific event only (calls `processEventSettlement` Cloud Function)

**User Service (`src/services/userService.ts`):**
- `getUserProfile(userId)` - Fetches user profile
- `getHydratedFriends(userId)` - Queries `friend_balances` to build friends list with balance data

**Event Ledger Service (`src/services/eventLedgerService.ts`):**
- Defines `EventPairBalance` type for per-pair event balance documents

**Firestore Utils (`src/utils/firestore.ts`):**
- `saveFriendToFirestore(userId, friend)` - Adds friend using `arrayUnion`
- `updateUserProfile(userId, updates)` - Updates user document with merge
- `createPersonObject(name, venmoId, useNameAsVenmoId)` - Helper for person objects

#### Real-time Subscriptions

**useBills Hook (`src/hooks/useBills.ts`):**
```typescript
// Listens to user's private bills in real-time
query(
  collection(db, 'bills'),
  where('ownerId', '==', userId),
  where('billType', '==', 'private'),
  orderBy('updatedAt', 'desc')
)
// Most recent bill = active session
// Older bills = saved sessions
```

**useBillSession Hook (`src/hooks/useBillSession.ts`):**
```typescript
// Listens to single bill document in real-time
// Auto-syncs all changes (billData, itemAssignments, people) to Firestore
// Debounces updates to avoid excessive writes
```

**useEventManager Hook (`src/hooks/useEventManager.ts`):**
```typescript
// Listens to events where user is owner
query(
  collection(db, 'events'),
  where('ownerId', '==', userId),
  orderBy('updatedAt', 'desc')
)
```

**useEventLedger Hook (`src/hooks/useEventLedger.ts`):**
```typescript
// Subscribes to per-pair event balance docs in real-time
query(
  collection(db, 'event_balances'),
  where('eventId', '==', eventId)
)
// Derives netBalances and optimizedDebts client-side from pair docs
// Falls back to computeEventBalances(bills) when no pair docs exist
```

#### Share Link Flow

1. User clicks "Share" → `billService.generateShareCode(billId, userId)`
2. Share code stored in bill document (6 chars, expires in 7 days)
3. Recipient visits `/join/{shareCode}`
4. App calls `billService.getBillByShareCode(code)` (validates expiration)
5. Recipient authenticated → `billService.joinBill()` adds them to `members` array
6. Firestore security rules grant read/update access to members

#### Receipt Upload Flow

1. User selects image → `useFileUpload` hook processes file
2. File uploaded to Storage: `receipts/{userId}/{timestamp}-{filename}`
3. Get download URL → `getDownloadURL(storageRef)`
4. URL saved to bill document: `receiptImageUrl` and `receiptFileName`
5. Gemini AI analyzes image → Extracts bill data → Updates Firestore
6. On delete: Remove from Storage using `receiptFileName`

### Calculation Logic

**Tax and tip are distributed proportionally** based on item subtotals:
```
personSubtotal = sum of (item.price / numberOfPeopleSharingItem)
proportion = personSubtotal / totalAssignedSubtotal
personTax = billData.tax × proportion
personTip = effectiveTip × proportion
personTotal = personSubtotal + personTax + personTip
```

See `shared/calculations.ts` for implementation (shared between client and Cloud Functions).

### Ledger Pipeline (`functions/src/ledgerProcessor.ts`)

Server-side Cloud Function triggered on every `bills/{billId}` write. No client ever writes to `friend_balances` or `event_balances` directly.

**3-stage pipeline:**

1. **Stage 1 — Validate & Calculate**: Computes `personTotals` server-side. Skips if no relevant fields changed (`billData`, `people`, `itemAssignments`, `settledPersonIds`, `paidById`, `splitEvenly`, `ownerId`, `_friendScanTrigger`).

2. **Stage 2 — Friend Ledger** (authoritative, transactional): Computes `calculateFriendFootprint()` → diffs against `bill.processedBalances` (old footprint) → applies delta to `friend_balances/{uid1_uid2}` docs. Only processes people who are linked friends of the owner.

3. **Stage 3 — Event Pair Ledger** (transactional): If bill has `eventId`, computes footprint for event participants (event members + linked friends) → diffs against `bill.processedEventBalances` → applies delta to `event_balances/{eventId_uid1_uid2}` per-pair docs.

**Idempotent delta mechanism**: The `processedBalances` and `processedEventBalances` fields on the bill store the last-applied footprint. On any edit, old footprint is reversed and new footprint applied, preventing double-counting on retries.

**On bill DELETE**: Reverses both footprints (`reverseFootprint` + `reverseEventFootprint`).

### Settlement Flow

**Global Settlement** (`processSettlement` Cloud Function):
1. Reads `friend_balances/{uid1_uid2}` to get `balance` and `unsettledBillIds`
2. For each bill: marks debtor as settled (`settledPersonIds`), zeros `processedBalances[debtorUid]`
3. Zeros `friend_balances` balance
4. Writes immutable `settlements` record
5. Pipeline re-fires from `settledPersonIds` change → updates `event_balances` via flow-through

**Event-Scoped Settlement** (`processEventSettlement` Cloud Function):
1. Reads `event_balances/{eventId_uid1_uid2}` to get `unsettledBillIds`
2. For each bill: marks debtor as settled, zeros `processedEventBalances[debtorUid]`
3. Zeros event pair balance
4. Does NOT touch `processedBalances` — pipeline re-fires and updates `friend_balances` via flow-through
5. **One settle action reduces both event and global friend balances**

**Settlement Reversal** (`reverseSettlement` Cloud Function):
- Removes debtor from `settledPersonIds` on each bill
- Does NOT directly modify balance docs — pipeline auto-fires and recalculates via deltas

### Type System

All types are in `src/types/`:
- **`bill.types.ts`** - BillData, BillItem, Bill (Firestore document)
- **`person.types.ts`** - Person, UserProfile, Friend, VenmoCharge
- **`assignment.types.ts`** - ItemAssignment, AssignmentMode, PersonTotal
- **`squad.types.ts`** - Squad, SquadMember, CreateSquadInput, UpdateSquadInput
- **`event.types.ts`** - TripEvent, EventInvitation
- **`gradient.types.ts`** - GradientBlob (landing page animations)

Components should always type their props with an interface.

## Key Technical Patterns

### Adding Items (Manual or AI)

Items can be added two ways:
1. **AI**: `analyzeReceipt()` → Gemini extracts items → `setBillData()` with full bill
2. **Manual**: User clicks "Add Item" → `addItem()` → Creates bill if null, or appends to existing

Both paths recalculate `subtotal` and `total` after item changes.

### Venmo Integration

Uses **deep link URL scheme**: `venmo://paycharge?txn=charge&recipients={id}&amount={amount}&note={note}`

The `note` field contains itemized breakdown generated by `generateItemDescription()`:
```
"Restaurant Name: Pizza ($12.00), Soda (split 2 ways) ($3.00)"
```

Fallback to web URL if Venmo app not detected.

### Friends List Autocomplete

When typing in "Add Person" field:
- Filters friends using `startsWith()` (not `includes()`)
- Clicking suggestion automatically adds friend to bill via `addFromFriend()`
- Friends stored in Firestore and synced on component mount

### Squads (Saved Friend Groups)

Users can save frequent groups of people to avoid re-entering names:
- **Create Squad**: Settings → Squads tab → Add squad with name and members
- **Use Squad**: Bill page → "Add from Squad" → Automatically populates people list
- **Storage**: Squads stored in Firestore under `users/{userId}/squads`
- **Validation**: Minimum 2 members, squad name required (see `src/utils/squadUtils.ts`)

### Bill Session Management

The app uses a single-active-session model with archives:
- **Active Session**: One bill at a time is "active" (latest bill user is working on)
- **Auto-save**: All changes sync to Firestore in real-time via `useBillSession`
- **Dashboard**: Shows active session (marked "Latest") + all saved/archived bills
- **Resume**: Clicking "Resume" on a saved bill sets it as active session
- **Create New**: Archives current active session before creating a new one
- **Context Provider**: `BillSessionContext` wraps bill pages and provides session management

## Environment Variables

Required in `.env`:
```
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_STORAGE_BUCKET=
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_ID=
```

## Firebase Deployment

The project uses Firebase for backend services. Configuration files:

- **`firebase.json`** - Firebase project configuration
  - Defines Firestore rules location (`firestore.rules`)
  - Defines Firestore indexes location (`firestore.indexes.json`)
  - Defines Storage rules location (`storage.rules`)
  - Configures Cloud Functions (if any)

- **`firestore.rules`** - Security rules for Firestore database
- **`firestore.indexes.json`** - Required composite indexes for queries
- **`storage.rules`** - Security rules for Cloud Storage

**Deploying changes:**
```bash
# Deploy all Firebase resources
firebase deploy

# Deploy only Firestore rules
firebase deploy --only firestore:rules

# Deploy only Storage rules
firebase deploy --only storage

# Deploy only indexes
firebase deploy --only firestore:indexes
```

**Note**: Firestore indexes can also be auto-created by running queries in development mode. Firebase will provide a link to create missing indexes.

## Component Structure

```
src/
├── components/
│   ├── bill/              # Bill items display (table/card + edit/add forms)
│   ├── bill-wizard/       # Multi-step bill creation wizard
│   ├── dashboard/         # Dashboard cards (MobileBillCard, DesktopBillCard, FriendBalancePreviewCard)
│   ├── events/            # Event management (InviteMembersDialog)
│   ├── landing/           # Landing page sections (hero, features, animations)
│   ├── layout/            # Navigation bars, headers, layout wrappers
│   ├── people/            # People management + friends dialogs
│   ├── profile/           # Profile settings cards
│   ├── receipt/           # Receipt upload UI
│   ├── settlements/       # SettleUpModal (Venmo + mark-as-settled)
│   ├── share/             # Share session modal and collaborative features
│   ├── shared/            # BalanceListRow, item assignment badges/dropdowns
│   ├── simple-transaction-wizard/  # Quick transaction flow
│   ├── squads/            # Squad management dialogs and forms
│   ├── ui/                # shadcn/ui primitives
│   └── venmo/             # Venmo charge dialog
├── hooks/                 # Custom hooks for state management
├── contexts/              # AuthContext, BillSessionContext
├── utils/                 # Calculations, validation, Venmo helpers, squad utils
├── services/              # billService, settlementService, userService, eventLedgerService, squadService
├── types/                 # TypeScript type definitions
└── pages/                 # Route components (Dashboard, EventDetailView, SettingsView, etc.)

shared/                    # Pure functions shared between client and Cloud Functions
├── calculations.ts        # calculatePersonTotals (proportional tax/tip)
├── ledgerCalculations.ts  # getFriendBalanceId, getEventBalanceId, calculateFriendFootprint, toSingleBalance
├── optimizeDebts.ts       # Greedy debt minimization algorithm
└── types.ts               # PersonTotal type

functions/src/             # Firebase Cloud Functions
├── index.ts               # Function exports (analyzeBill, inviteMemberToEvent, processSettlement, etc.)
├── ledgerProcessor.ts     # onDocumentWritten('bills/{billId}') — 3-stage ledger pipeline
├── friendAddProcessor.ts  # onDocumentUpdated('users/{userId}') — retroactive friend scan
├── eventDeleteProcessor.ts       # onDocumentDeleted('events/{eventId}') — cascade cleanup
├── settlementProcessor.ts        # processSettlement callable — global friend settlement
├── eventSettlementProcessor.ts   # processEventSettlement callable — event-scoped settlement
└── settlementReversal.ts         # reverseSettlement callable — undo settlement
```

## Important Notes

### General
- **Mobile breakpoint**: 768px (defined in `use-mobile.tsx`)
- **Item IDs**: Generated using `item-${Date.now()}` or `person-${Date.now()}`
- **Firestore undefined**: Never save `undefined` to Firestore - omit the field or use conditional spreading

### Database Best Practices

**Firestore Writes:**
- **Never save `undefined`**: Firestore throws errors on undefined values. Always omit the field or use conditional spreading:
  ```typescript
  // Good
  { name: 'John', ...(venmoId && { venmoId }) }

  // Bad
  { name: 'John', venmoId: undefined }
  ```
- **Use `merge: true`**: When updating user documents, use `setDoc(ref, data, { merge: true })` to avoid overwriting
- **Use `arrayUnion`**: For adding items to arrays without duplicates (friends, members)
- **Use `serverTimestamp()`**: For consistent timestamps across clients

**Real-time Listeners:**
- Always unsubscribe in cleanup functions to prevent memory leaks
- Handle loading and error states for better UX
- Use `onSnapshot` for real-time updates, `getDoc`/`getDocs` for one-time reads

**Queries:**
- Composite indexes required for multi-field queries (configured in `firestore.indexes.json`)
- Order of `where()` clauses matters for index creation
- `orderBy` field must also have a `where` clause or be in index

**Data Modeling:**
- **Squads**: Stored as array in user document (not subcollection) for atomic updates
- **Friends**: Stored as array in user document (simple, no need for subcollection)
- **Bills**: Top-level collection (enables sharing, better security rules, independent lifecycle)
- **Members array**: Enables granular access control via security rules

### Bill Management
- **Bill state can be null**: Always check `billData` before accessing properties. Bill is created on first item add OR receipt upload.
- **Auto-save**: All bill changes automatically sync to Firestore via `useBillSession` hook
- **Active session**: Only one bill is "active" at a time; creating a new bill archives the current one
- **Assignment modes**: Desktop supports both "checkboxes" (badges) and "dropdown" modes. Mobile is always badges.
- **Real-time sync**: `useBillSession` debounces updates to avoid excessive Firestore writes

### Settings Page
- **Card-based UI**: Settings page uses tabbed card layout (Profile, Friends, Squads)
- **Auth required**: Settings page shows sign-in prompt when user is not authenticated
- **Three tabs**: Profile (Venmo ID), Friends (manage friends list), Squads (manage saved groups)

### Navigation
- **AuthButton**: Shows only "Settings" option in dropdown (other options removed as of recent commit)
- **Dashboard**: Primary hub for creating and managing bills
- **Landing page**: Enhanced with new animations, parallax gradients, and feature showcases
