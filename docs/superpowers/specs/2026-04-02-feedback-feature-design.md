# Feedback Feature Design

## Overview

Add a feedback system to the app where users can report bugs or suggest features. Feedback is stored in Firestore with optional screenshot uploads to Cloud Storage. No email notification — feedback is reviewed via the Firebase console.

## UI Flow

1. **Profile tab** in Settings gets a "Send Feedback" button at the bottom, below the Sign Out button, separated by a divider
2. Clicking opens a **FeedbackModal** dialog with:
   - **Type selector**: Toggle between "Bug Report" and "Suggestion" (pill-style buttons)
   - **Description**: Textarea for the message (required)
   - **Screenshots**: Optional image uploads with no limit on count. Each shows a thumbnail with a remove button. Add button opens file picker.
   - **Submit button**: Uploads images, writes Firestore doc, shows success toast, closes modal

## Data Model

### Firestore: `feedback/{feedbackId}`

| Field | Type | Description |
|-------|------|-------------|
| userId | string | Auth UID of submitter |
| userName | string | Display name |
| userEmail | string | Email address |
| type | `'bug' \| 'suggestion'` | Feedback category |
| message | string | Description text |
| imageUrls | string[] | Cloud Storage download URLs |
| createdAt | timestamp | Server timestamp |
| status | string | Always `'new'` on creation |

### Cloud Storage: `feedback/{userId}/{timestamp}-{filename}`

Same pattern as receipt uploads. Each image uploaded individually, download URL collected into the `imageUrls` array.

## Security Rules

### Firestore (`feedback` collection)

- **Create**: Authenticated users only. Must set `userId` to their own UID.
- **Read/Update/Delete**: Denied for all clients. Admin console only.

### Cloud Storage (`feedback/` path)

- **Write**: Authenticated users can write to `feedback/{userId}/**`
- **Read**: Owner only (matches `{userId}` to auth UID)

## Components

### `FeedbackButton` (inline in ProfileSettingsCard)

- Rendered below the Sign Out button with a divider separator
- Styled as a gradient button (primary colors)
- Opens the FeedbackModal on click

### `FeedbackModal` (`src/components/profile/FeedbackModal.tsx`)

- Uses existing `Dialog`/`DialogContent` from shadcn/ui
- Type selector: two toggle buttons, one active at a time
- Textarea: standard `Textarea` component, required validation
- Image upload: file input (accept `image/*`), thumbnails with remove buttons, no limit on images
- Submit: validates message is non-empty, uploads images to Storage, writes Firestore doc, shows toast, closes modal
- Loading state: spinner on submit button while uploading/saving

### `feedbackService.ts` (`src/services/feedbackService.ts`)

- `submitFeedback(userId, userName, userEmail, type, message, files)`: Uploads images to Cloud Storage, collects download URLs, writes Firestore document
- No Cloud Function needed — direct client-side Firestore write

## Error Handling

- Image upload failures: toast error, don't submit partial feedback
- Firestore write failure: toast error with retry suggestion
- Empty message validation: disable submit button until message is non-empty
