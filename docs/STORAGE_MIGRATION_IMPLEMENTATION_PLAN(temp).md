Storage Architecture Migration - Implementation Plan
Migrate from the current fragmented storage architecture (collaborativeSessions, groupTransactions, users/{userId}/sessions) to a unified bills collection with enhanced access control, share links, and guest permissions as defined in 

STORAGE_ARCHITECTURE.md
.

User Review Required
IMPORTANT

Incremental Migration Strategy This plan is designed to migrate the storage architecture in small, testable phases while keeping the UI functional throughout. Each work item can be implemented and tested independently by different agents.

WARNING

Breaking Changes

New Firestore security rules will be deployed that change access patterns
Old collections will be deprecated but not immediately deleted
Share link system introduces new URL patterns (/join/{billId}?code=ABC123)
Proposed Changes
The migration is organized into 9 phases, each containing small, independent work items that can be assigned to different agents. Each work item is designed to be testable in isolation.

Phase 1: Foundation & Type Definitions
Create the new type system for the unified bills collection.

Work Item 1.1: Create Unified Bill Type
File: [NEW] 

bill.types.ts

Changes:

Extend existing 

BillData
 interface
Add new 

Bill
 interface with:
billType: 'private' | 'group'
ownerId: string
groupId?: string
shareCode?: string
shareCodeCreatedAt?: Timestamp
shareCodeExpiresAt?: Timestamp
shareCodeCreatedBy?: string
members: BillMember[]
status: 'active' | 'archived'
createdAt, updatedAt, lastActivity
Testing: TypeScript compilation should pass

Work Item 1.2: Create Share Link Types
File: [MODIFY] 

bill.types.ts

Changes:

Add ShareLink interface
Add ShareLinkValidation result type
Add BillMember interface (similar to 

SessionMember
)
Testing: TypeScript compilation should pass

Work Item 1.3: Update User Type
File: [NEW] 

user.types.ts

Changes:

Create 

User
 interface with:
uid, email, displayName, photoURL, venmoId
friends: Friend[]
squads: Squad[]
createdAt, lastLoginAt
Testing: TypeScript compilation should pass

Phase 2: New Bills Collection Infrastructure
Create hooks and utilities for the new bills collection.

Work Item 2.1: Create Share Code Generator
File: [NEW] 

shareCode.utils.ts

Changes:

generateShareCode(): Generate 6-character alphanumeric code
calculateExpiration(): Return timestamp 7 days from now
isShareCodeExpired(expiresAt): Check if expired
validateShareCode(code): Validate format
Testing:

Unit test: Generate 100 codes, verify uniqueness and format
Unit test: Verify expiration calculation is exactly 7 days
Unit test: Validate expired vs non-expired codes
Work Item 2.2: Create useBills Hook - Read Operations
File: [NEW] 

useBills.ts

Changes:


useBill(billId)
: Real-time listener for single bill
useUserBills(userId): Query all bills where user is owner or member
useGroupBills(groupId): Query all bills for a group
Testing:

Manual: Create a test bill in Firestore console, verify hook loads it
Manual: Verify real-time updates work when bill is modified
Work Item 2.3: Create useBills Hook - Write Operations
File: [MODIFY] 

useBills.ts

Changes:

createBill(data, billType): Create private or group bill
updateBill(billId, updates): Update bill data
deleteBill(billId): Delete bill and cleanup
archiveBill(billId): Set status to 'archived'
Testing:

Manual: Use hook to create a bill, verify in Firestore console
Manual: Update a bill, verify changes persist
Manual: Delete a bill, verify it's removed
Work Item 2.4: Create Share Link Management
File: [MODIFY] 

useBills.ts

Changes:

generateShareLink(billId): Create/regenerate share code
validateShareLink(billId, code): Validate code and expiration
revokeShareLink(billId): Remove share code
Testing:

Manual: Generate share link, verify code in Firestore
Manual: Validate with correct code (should pass)
Manual: Validate with wrong code (should fail)
Manual: Validate expired code (should fail)
Phase 3: Access Control & Permissions
Implement permission checking logic.

Work Item 3.1: Create Permission Utilities
File: [NEW] 

permissions.utils.ts

Changes:

canEditBill(bill, userId): Check if user can edit
canDeleteBill(bill, userId): Check if user can delete
canGenerateShareLink(bill, userId): Check share link permission
isGuest(bill, userId): Check if user is guest (not owner/member)
getGuestPermissions(bill): Return guest capability object
Testing:

Unit test: Owner can edit/delete private bill
Unit test: Group member can edit group bill
Unit test: Guest cannot edit bill
Unit test: Guest can only assign themselves
Work Item 3.2: Create usePermissions Hook
File: [NEW] 

usePermissions.ts

Changes:

Hook that wraps permission utilities
Returns permission object for current user and bill
Memoizes results for performance
Testing:

Manual: Test with different user roles (owner, member, guest)
Manual: Verify permissions update when bill changes
Phase 4: Firestore Security Rules
Write and deploy new security rules.

Work Item 4.1: Write Bills Collection Security Rules
File: [MODIFY] 

firestore.rules

Changes:

Add bills/{billId} rules:
Read: Owner, group members, or valid share link
Create: Authenticated users only
Update: Owner/members (full), guests (assignments only)
Delete: Owner only
Add helper functions for share link validation
Testing:

Use Firebase Emulator to test rules
Test: Owner can read/write their bill
Test: Group member can read/write group bill
Test: Guest with valid code can read and update assignments
Test: Guest with invalid code cannot access
Test: Guest cannot modify bill structure
Work Item 4.2: Deploy Security Rules
File: [MODIFY] 

firestore.rules

Changes:

Deploy rules to Firebase
Keep old collection rules active during migration
Testing:

Manual: Verify rules deployed successfully
Manual: Test access patterns in production
Phase 5: Data Migration Scripts
Create scripts to migrate existing data.

Work Item 5.1: Migration Script - collaborativeSessions → bills
File: [NEW] 

migrate-collaborative-sessions.ts

Changes:

Script to read all collaborativeSessions
Transform to new 

Bill
 format:
Set billType: 'private'
Set ownerId from creatorId
Copy shareCode if exists
Transform members array
Set status: 'active' or 'archived' based on session status
Write to bills collection
Log migration results
Testing:

Manual: Run script on test data
Manual: Verify transformed data in Firestore
Manual: Check migration logs for errors
Work Item 5.2: Migration Script - groupTransactions → bills
File: [NEW] 

migrate-group-transactions.ts

Changes:

Script to read all groupTransactions
Transform to new 

Bill
 format:
Set billType: 'group'
Set groupId from transaction
Set ownerId from createdBy
Transform billData structure
Set status: 'active'
Write to bills collection
Log migration results
Testing:

Manual: Run script on test data
Manual: Verify transformed data in Firestore
Manual: Check migration logs for errors
Work Item 5.3: Migration Script - users/{userId}/sessions → bills
File: [NEW] 

migrate-user-sessions.ts

Changes:

Script to read all user private sessions
Transform to new 

Bill
 format:
Set billType: 'private'
Set ownerId from user path
Set status from session status
Write to bills collection
Log migration results
Testing:

Manual: Run script on test data
Manual: Verify transformed data in Firestore
Manual: Check migration logs for errors
Phase 6: Update UI Components (Private Bills)
Migrate private bill UI to use new bills collection.

Work Item 6.1: Create BillSessionAdapter
File: [NEW] 

billSessionAdapter.ts

Changes:

Adapter to convert 

Bill
 ↔ 

BillSession
 format
Allows gradual UI migration
billToSession(bill): Convert Bill to BillSession
sessionToBill(session): Convert BillSession to Bill
Testing:

Unit test: Round-trip conversion preserves data
Unit test: Handle missing optional fields
Work Item 6.2: Update AIScanView - Read from Bills
File: [MODIFY] 

AIScanView.tsx

Changes:

Replace 

useBillSessionManager
 with useBills
Use adapter to convert Bill to BillSession format
Keep all UI logic unchanged
Testing:

Browser test: Create new bill via AI scan
Browser test: Verify bill saved to bills collection
Browser test: Verify UI still works as before
Work Item 6.3: Update AIScanView - Write to Bills
File: [MODIFY] 

AIScanView.tsx

Changes:

Update save operations to write to bills collection
Update delete operations to use new hook
Testing:

Browser test: Edit bill items, verify updates persist
Browser test: Delete bill, verify removed from Firestore
Work Item 6.4: Add Share Link UI to Private Bills
File: [MODIFY] 

AIScanView.tsx

Changes:

Add "Share Bill" button
Show share link dialog with QR code
Display expiration date
Add "Regenerate Link" button
Testing:

Browser test: Generate share link
Browser test: Copy link and verify format
Browser test: Regenerate link, verify code changes
Work Item 6.5: Update CollaborativeSessionView
File: [MODIFY] 

CollaborativeSessionView.tsx

Changes:

Replace 

useCollaborativeSession
 with useBills
Use adapter for data conversion
Keep UI logic unchanged
Testing:

Browser test: Join session via share link
Browser test: Verify real-time updates work
Browser test: Multiple users can collaborate
Phase 7: Update UI Components (Group Bills)
Migrate group bill UI to use new bills collection.

Work Item 7.1: Update GroupDetailView - Read from Bills
File: [MODIFY] 

GroupDetailView.tsx

Changes:

Replace 

useGroupTransactions
 with useBills
Filter bills by groupId
Use adapter for data conversion
Testing:

Browser test: View group bills
Browser test: Verify bills load correctly
Work Item 7.2: Update GroupDetailView - Write to Bills
File: [MODIFY] 

GroupDetailView.tsx

Changes:

Update create/update/delete operations
Set billType: 'group' and groupId
Testing:

Browser test: Create group bill
Browser test: Edit group bill
Browser test: Delete group bill
Work Item 7.3: Add Share Link UI to Group Bills
File: [MODIFY] 

GroupDetailView.tsx

Changes:

Add "Share Bill" button (any member can generate)
Show share link dialog
Display who created the link
Testing:

Browser test: Any group member can generate share link
Browser test: Share link works for guests
Phase 8: Guest Access UI
Implement guest-specific UI restrictions.

Work Item 8.1: Create Guest Mode Detection
File: [NEW] 

useGuestMode.ts

Changes:

Hook to detect if current user is guest
Check if user accessed via share link
Check if user is in bill members list
Testing:

Browser test: Access bill via share link as guest
Browser test: Verify guest mode detected
Browser test: Authenticated user not detected as guest
Work Item 8.2: Implement Restricted UI for Guests
File: [MODIFY] Multiple component files

Changes:

Disable item editing for guests
Disable people management for guests
Disable tax/tip editing for guests
Show read-only indicators
Allow guests to assign themselves only
Testing:

Browser test: Guest cannot edit items
Browser test: Guest cannot add/remove people
Browser test: Guest can assign themselves to items
Browser test: Guest can see their total
Work Item 8.3: Add Sign-Up Prompts for Guests
File: [NEW] 

GuestBanner.tsx

Changes:

Create banner component for guests
Show benefits of signing up
Add "Sign Up" CTA button
Dismissible but reappears on reload
Testing:

Browser test: Guest sees banner
Browser test: Authenticated user doesn't see banner
Browser test: Banner links to sign-up flow
Work Item 8.4: Create Join Session Page
File: [MODIFY] 

JoinSession.tsx

Changes:

Update to use new bills collection
Validate share code on load
Show error for expired/invalid codes
Redirect to bill view on success
Testing:

Browser test: Valid share link redirects to bill
Browser test: Invalid code shows error
Browser test: Expired code shows error with regenerate prompt
Phase 9: Cleanup & Deprecation
Remove old code and collections after verification.

Work Item 9.1: Mark Old Hooks as Deprecated
Files:

[MODIFY] 

useCollaborativeSession.ts
[MODIFY] 

useGroupTransactions.ts
[MODIFY] 

useBillSessionManager.ts
Changes:

Add @deprecated JSDoc comments
Add console warnings when used
Point to new useBills hook
Testing:

Manual: Verify deprecation warnings appear in console
Work Item 9.2: Add Migration Notices
File: [NEW] 

MIGRATION_GUIDE.md

Changes:

Document migration process
List breaking changes
Provide code examples for updating
Timeline for old collection removal
Testing:

Manual: Review documentation for clarity
Work Item 9.3: Archive Old Collections (30-day retention)
File: [MODIFY] 

firestore.rules

Changes:

Set old collections to read-only
Add deprecation notices in rules comments
Keep data accessible for 30 days
Testing:

Manual: Verify old collections are read-only
Manual: Verify data still accessible
Work Item 9.4: Remove Old Code
Files: Multiple files to delete

Changes:

Delete deprecated hooks after 30 days
Delete old collection references
Update imports throughout codebase
Remove old security rules
Testing:

Manual: Run full app test suite
Browser test: Verify all features still work
Manual: Check for any remaining references to old collections
Verification Plan
Automated Tests
Each work item includes specific testing instructions. Key automated tests to add:

Unit Tests (to be created):

shareCode.utils.test.ts: Test share code generation and validation
permissions.utils.test.ts: Test permission logic
billSessionAdapter.test.ts: Test data conversion
Run Tests:

npm test
Manual Verification
After completing each phase, perform these manual tests:

Phase 1-2: Foundation
Create a test bill in Firestore console
Verify hooks load and display data
Verify real-time updates work
Phase 3-4: Permissions
Test as owner: Can edit/delete
Test as group member: Can edit group bills
Test as guest: Can only assign self
Test with invalid share code: Access denied
Phase 5: Migration
Run migration scripts on test data
Compare old vs new data structure
Verify no data loss
Phase 6-7: UI Updates
Create bill via AI scan
Edit bill items and assignments
Generate share link
Join via share link
Test group bill creation and editing
Phase 8: Guest Access
Access bill as unauthenticated user via share link
Verify restricted UI (cannot edit items/people)
Verify can assign self to items
Verify sign-up prompts appear
Phase 9: Cleanup
Verify old collections are read-only
Verify no console errors
Verify all features work with new architecture
Browser Testing
Use the browser subagent to test critical user flows:

Private Bill Flow:

Navigate to /ai-scan
Upload receipt or use demo
Add people
Assign items
Generate share link
Open share link in incognito window
Join as guest
Assign self to items
Group Bill Flow:

Navigate to groups
Create group bill
Generate share link
Join as guest
Guest Restrictions:

Access bill as guest
Verify cannot edit items (buttons disabled)
Verify can assign self
Verify sign-up banner appears
Performance Testing
Monitor Firestore read/write counts
Verify real-time listeners don't create excessive connections
Check for memory leaks in long-running sessions
Migration Timeline
Phase	Estimated Work Items	Can Run in Parallel
Phase 1	3 items	Yes (all 3)
Phase 2	4 items	Item 2.1 first, then 2.2-2.4 in parallel
Phase 3	2 items	Yes (both)
Phase 4	2 items	Sequential (4.1 → 4.2)
Phase 5	3 items	Yes (all 3)
Phase 6	5 items	Sequential (6.1 → 6.2 → 6.3 → 6.4 → 6.5)
Phase 7	3 items	Sequential (7.1 → 7.2 → 7.3)
Phase 8	4 items	8.1 first, then 8.2-8.4 in parallel
Phase 9	4 items	Sequential (9.1 → 9.2 → 9.3 → wait 30 days → 9.4)
Total Work Items: 30 independent, testable chunks

Notes
Each work item is designed to be completed by a single agent in one session
Work items include specific testing instructions
UI remains functional throughout migration via adapter pattern
Old collections remain accessible during transition
30-day verification period before final cleanup