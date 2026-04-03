# Feedback Feature Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a feedback system where users can report bugs or suggest features from the Profile settings tab, with data stored in Firestore and optional screenshot uploads to Cloud Storage.

**Architecture:** A "Send Feedback" button at the bottom of `ProfileSettingsCard` opens a `FeedbackModal` dialog. The modal collects type (bug/suggestion), message, and optional images. A `feedbackService` handles image uploads to Cloud Storage and writes a Firestore document. Security rules restrict creation to authenticated users and block all client reads.

**Tech Stack:** React, TypeScript, Firebase Firestore, Firebase Cloud Storage, shadcn/ui Dialog + Textarea components

---

## File Structure

| Action | File | Responsibility |
|--------|------|---------------|
| Create | `src/services/feedbackService.ts` | Upload images to Storage, write feedback doc to Firestore |
| Create | `src/components/profile/FeedbackModal.tsx` | Dialog with type selector, textarea, image upload, submit |
| Modify | `src/components/profile/ProfileSettingsCard.tsx` | Add "Send Feedback" button below Sign Out |
| Modify | `firestore.rules` | Add `feedback` collection rules |
| Modify | `storage.rules` | Add `feedback/` path rules |

---

### Task 1: Firestore & Storage Security Rules

**Files:**
- Modify: `firestore.rules` (add after `eventInvitations` block, before closing braces)
- Modify: `storage.rules` (add after `profile-photos` block)

- [ ] **Step 1: Add Firestore rules for `feedback` collection**

Add this block in `firestore.rules` after the `eventInvitations` match block (before the final two closing braces):

```
    // ========== Feedback Collection ==========
    match /feedback/{feedbackId} {
      // Create: authenticated users only, must set own userId
      allow create: if request.auth != null &&
                       request.resource.data.userId == request.auth.uid;
      // No client reads/updates/deletes — admin console only
      allow read, update, delete: if false;
    }
```

- [ ] **Step 2: Add Storage rules for `feedback/` path**

Add this block in `storage.rules` after the `profile-photos` match block:

```
    // Allow authenticated users to upload feedback screenshots
    match /feedback/{userId}/{allPaths=**} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
```

- [ ] **Step 3: Commit**

```bash
git add firestore.rules storage.rules
git commit -m "add security rules for feedback collection and storage"
```

---

### Task 2: Feedback Service

**Files:**
- Create: `src/services/feedbackService.ts`

- [ ] **Step 1: Create the feedback service**

Create `src/services/feedbackService.ts`:

```typescript
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from '@/config/firebase';

const FEEDBACK_COLLECTION = 'feedback';

interface SubmitFeedbackParams {
  userId: string;
  userName: string;
  userEmail: string;
  type: 'bug' | 'suggestion';
  message: string;
  files: File[];
}

async function uploadFeedbackImages(userId: string, files: File[]): Promise<string[]> {
  const urls: string[] = [];
  for (const file of files) {
    const fileName = `${Date.now()}-${file.name}`;
    const storageRef = ref(storage, `feedback/${userId}/${fileName}`);
    const snapshot = await uploadBytes(storageRef, file);
    const downloadURL = await getDownloadURL(snapshot.ref);
    urls.push(downloadURL);
  }
  return urls;
}

export async function submitFeedback({
  userId,
  userName,
  userEmail,
  type,
  message,
  files,
}: SubmitFeedbackParams): Promise<void> {
  const imageUrls = files.length > 0
    ? await uploadFeedbackImages(userId, files)
    : [];

  await addDoc(collection(db, FEEDBACK_COLLECTION), {
    userId,
    userName,
    userEmail,
    type,
    message,
    imageUrls,
    createdAt: serverTimestamp(),
    status: 'new',
  });
}
```

- [ ] **Step 2: Commit**

```bash
git add src/services/feedbackService.ts
git commit -m "add feedback service for Firestore writes and image uploads"
```

---

### Task 3: Feedback Modal Component

**Files:**
- Create: `src/components/profile/FeedbackModal.tsx`

- [ ] **Step 1: Create the FeedbackModal component**

Create `src/components/profile/FeedbackModal.tsx`:

```tsx
import { useState, useRef } from 'react';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { submitFeedback } from '@/services/feedbackService';
import { Loader2, Bug, Lightbulb, ImagePlus, X } from 'lucide-react';

interface FeedbackModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function FeedbackModal({ open, onOpenChange }: FeedbackModalProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [type, setType] = useState<'bug' | 'suggestion'>('bug');
  const [message, setMessage] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const resetForm = () => {
    setType('bug');
    setMessage('');
    setFiles([]);
    previews.forEach((url) => URL.revokeObjectURL(url));
    setPreviews([]);
  };

  const handleClose = (open: boolean) => {
    if (!open) resetForm();
    onOpenChange(open);
  };

  const handleAddImages = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files;
    if (!selected) return;
    const newFiles = Array.from(selected);
    setFiles((prev) => [...prev, ...newFiles]);
    const newPreviews = newFiles.map((f) => URL.createObjectURL(f));
    setPreviews((prev) => [...prev, ...newPreviews]);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleRemoveImage = (index: number) => {
    URL.revokeObjectURL(previews[index]);
    setFiles((prev) => prev.filter((_, i) => i !== index));
    setPreviews((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async () => {
    if (!user || !message.trim()) return;
    setIsSubmitting(true);
    try {
      await submitFeedback({
        userId: user.uid,
        userName: user.displayName || 'Anonymous',
        userEmail: user.email || '',
        type,
        message: message.trim(),
        files,
      });
      toast({
        title: 'Feedback submitted',
        description: 'Thank you! Your feedback helps us improve.',
      });
      handleClose(false);
    } catch (error) {
      console.error('Error submitting feedback:', error);
      toast({
        title: 'Submission failed',
        description: 'Something went wrong. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent
        className="sm:max-w-md"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <DialogTitle className="text-lg font-semibold">
          Send Feedback
        </DialogTitle>
        <DialogDescription className="sr-only">
          Report a bug or suggest a feature
        </DialogDescription>

        <div className="space-y-4 pt-2">
          {/* Type selector */}
          <div className="flex gap-2">
            <Button
              type="button"
              variant={type === 'bug' ? 'default' : 'outline'}
              className="flex-1 gap-2"
              onClick={() => setType('bug')}
            >
              <Bug className="w-4 h-4" />
              Bug Report
            </Button>
            <Button
              type="button"
              variant={type === 'suggestion' ? 'default' : 'outline'}
              className="flex-1 gap-2"
              onClick={() => setType('suggestion')}
            >
              <Lightbulb className="w-4 h-4" />
              Suggestion
            </Button>
          </div>

          {/* Message */}
          <Textarea
            placeholder={
              type === 'bug'
                ? 'Describe the issue you encountered...'
                : 'Describe your idea or suggestion...'
            }
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={4}
            className="resize-none"
          />

          {/* Image upload */}
          <div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={handleAddImages}
            />
            {previews.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-3">
                {previews.map((src, i) => (
                  <div key={i} className="relative w-16 h-16 rounded-lg overflow-hidden border">
                    <img
                      src={src}
                      alt={`Screenshot ${i + 1}`}
                      className="w-full h-full object-cover"
                    />
                    <button
                      type="button"
                      onClick={() => handleRemoveImage(i)}
                      className="absolute -top-1 -right-1 w-5 h-5 bg-destructive text-destructive-foreground rounded-full flex items-center justify-center text-xs"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              className="gap-2"
            >
              <ImagePlus className="w-4 h-4" />
              Add Screenshots
            </Button>
          </div>

          {/* Submit */}
          <Button
            type="button"
            className="w-full"
            onClick={handleSubmit}
            disabled={isSubmitting || !message.trim()}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
                Submitting...
              </>
            ) : (
              'Submit Feedback'
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/profile/FeedbackModal.tsx
git commit -m "add FeedbackModal component"
```

---

### Task 4: Add Feedback Button to Profile Settings

**Files:**
- Modify: `src/components/profile/ProfileSettingsCard.tsx`

- [ ] **Step 1: Add import and state for FeedbackModal**

Add to the imports at the top of `ProfileSettingsCard.tsx`:

```typescript
import { MessageSquare } from 'lucide-react';
import { FeedbackModal } from './FeedbackModal';
```

Add state inside the `ProfileSettingsCard` component, after the existing `fileInputRef`:

```typescript
const [feedbackOpen, setFeedbackOpen] = useState(false);
```

Also add `useState` to the existing React import if not already there (it already is).

- [ ] **Step 2: Add the feedback button and modal to the JSX**

After the Sign Out button's wrapping `<div className="space-y-2">` block (the last `<div>` before the closing `</div></Card>`), add:

```tsx
        <div className="border-t pt-4 mt-2">
          <Button
            onClick={() => setFeedbackOpen(true)}
            variant="outline"
            className="w-full gap-2"
          >
            <MessageSquare className="w-4 h-4" />
            Send Feedback
          </Button>
          <p className="text-xs text-muted-foreground text-center mt-2">
            Report bugs or suggest features
          </p>
        </div>

        <FeedbackModal
          open={feedbackOpen}
          onOpenChange={setFeedbackOpen}
        />
```

- [ ] **Step 3: Verify the dev server shows the button**

Run: `npm run dev`

Navigate to Settings > Profile tab. The "Send Feedback" button should appear below Sign Out. Clicking it should open the feedback modal.

- [ ] **Step 4: Commit**

```bash
git add src/components/profile/ProfileSettingsCard.tsx
git commit -m "add send feedback button to profile settings"
```

---

### Task 5: Deploy Security Rules

- [ ] **Step 1: Deploy Firestore and Storage rules**

```bash
firebase deploy --only firestore:rules,storage
```

Expected: both deploy successfully.

- [ ] **Step 2: Manual smoke test**

1. Open the app, go to Settings > Profile
2. Click "Send Feedback"
3. Select "Bug Report", type a message, optionally attach images
4. Click Submit
5. Check Firebase console > Firestore > `feedback` collection — the document should appear with all fields

- [ ] **Step 3: Commit (if any fixes were needed)**

Only commit if adjustments were made during testing.
