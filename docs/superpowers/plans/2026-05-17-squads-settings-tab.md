# Squads Settings Tab Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a 4th "Squads" tab to the Settings page where users can create, edit, delete, and manage squad members without leaving Settings.

**Architecture:** Extract the member add/remove UI from `SquadForm` into a reusable `SquadMembersEditor`, then compose it into a new `SquadMembersModal` (opened when clicking a squad card in Settings). A new `SquadsSettingsCard` wires all the dialogs together using `useSquadManager` directly. `SquadsView` is untouched.

**Tech Stack:** React, TypeScript, shadcn/ui (Dialog, AlertDialog, Button, Card, Label, Input, ScrollArea), lucide-react, `useSquadManager`, `useFriendSearch`

---

### Task 1: Extract `SquadMembersEditor` from `SquadForm`

**Files:**
- Create: `src/components/squads/SquadMembersEditor.tsx`
- Modify: `src/components/squads/SquadForm.tsx`

- [ ] **Step 1: Create `SquadMembersEditor.tsx`**

Create `src/components/squads/SquadMembersEditor.tsx` with the full content below. This is a direct lift of the member management section from `SquadForm` (lines 92–224), converted to accept `members` + `onChange` props.

```tsx
import { useState } from 'react';
import { X, UserPlus, Mail, Phone, Ticket, User } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { SquadMember } from '@/types/squad.types';
import { sanitizeSquadMember } from '@/utils/squadUtils';
import { useFriendSearch } from '@/hooks/useFriendSearch';

interface SquadMembersEditorProps {
  members: SquadMember[];
  onChange: (members: SquadMember[]) => void;
}

export function SquadMembersEditor({ members, onChange }: SquadMembersEditorProps) {
  const [newMemberName, setNewMemberName] = useState('');
  const [newMemberEmail, setNewMemberEmail] = useState('');
  const [newMemberPhone, setNewMemberPhone] = useState('');
  const [newMemberVenmoId, setNewMemberVenmoId] = useState('');
  const [showExtraFields, setShowExtraFields] = useState(false);

  const { filteredFriends, showSuggestions, setShowSuggestions } = useFriendSearch(newMemberName);

  const handleAddMember = () => {
    if (!newMemberName.trim()) return;

    const newMember: SquadMember = sanitizeSquadMember({
      name: newMemberName,
      email: newMemberEmail.trim() || undefined,
      phoneNumber: newMemberPhone.trim() || undefined,
      venmoId: newMemberVenmoId.replace(/^@+/, '').trim() || undefined,
    });

    const isDuplicate = members.some(
      (m) =>
        m.name.toLowerCase() === newMember.name.toLowerCase() ||
        (m.email && newMember.email && m.email.toLowerCase() === newMember.email.toLowerCase()) ||
        (m.phoneNumber && newMember.phoneNumber && m.phoneNumber === newMember.phoneNumber)
    );

    if (!isDuplicate) onChange([...members, newMember]);

    setNewMemberName('');
    setNewMemberEmail('');
    setNewMemberPhone('');
    setNewMemberVenmoId('');
    setShowExtraFields(false);
  };

  const handleRemoveMember = (index: number) => {
    onChange(members.filter((_, i) => i !== index));
  };

  return (
    <div className="border border-border rounded-md p-3 space-y-3 bg-card">
      <div className="space-y-3">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Input
              placeholder="Search for users or type guest name..."
              value={newMemberName}
              onChange={(e) => setNewMemberName(e.target.value)}
              className="w-full"
            />
            {showSuggestions && filteredFriends.length > 0 && (
              <div className="absolute top-full left-0 right-0 mt-2 bg-popover border border-border rounded-md shadow-md flex flex-col overflow-hidden z-50">
                <div className="px-3 py-2 bg-muted/50 border-b border-border">
                  <Label className="text-xs text-muted-foreground uppercase tracking-wider">
                    Search Results
                  </Label>
                </div>
                <ScrollArea className="max-h-[200px] w-full">
                  <div className="p-2">
                    {filteredFriends.map((friend, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => {
                          const newMember: SquadMember = {
                            id: friend.id,
                            name: friend.name,
                            email: friend.email,
                            venmoId: friend.venmoId,
                          };
                          const isDuplicate = members.some(
                            (m) =>
                              (m.id && m.id === newMember.id) ||
                              m.name.toLowerCase() === newMember.name.toLowerCase()
                          );
                          if (!isDuplicate) onChange([...members, newMember]);
                          setNewMemberName('');
                          setNewMemberEmail('');
                          setNewMemberPhone('');
                          setNewMemberVenmoId('');
                          setShowSuggestions(false);
                        }}
                        className="w-full text-left flex items-center p-2 rounded-md border border-border/40 bg-card hover:border-primary/30 hover:bg-accent/50 hover:shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all mb-1.5 cursor-pointer h-12"
                      >
                        <div className="flex items-center justify-center h-8 w-8 rounded-full bg-primary/10 mr-3 flex-shrink-0">
                          <User className="h-4 w-4 text-primary" />
                        </div>
                        <div className="flex flex-col flex-1 overflow-hidden">
                          <span className="text-sm font-medium truncate">{friend.name}</span>
                          {friend.username && (
                            <span className="text-xs text-muted-foreground truncate">
                              @{friend.username}
                            </span>
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                </ScrollArea>
              </div>
            )}
          </div>
          <Button
            onClick={handleAddMember}
            variant="secondary"
            size="icon"
            type="button"
            disabled={!newMemberName.trim()}
          >
            <UserPlus className="w-4 h-4" />
          </Button>
        </div>

        {!showExtraFields ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowExtraFields(true)}
            className="text-xs text-muted-foreground h-auto py-1"
            type="button"
          >
            + Add Guest Contact Info (Email/Phone/Venmo)
          </Button>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 animate-in fade-in slide-in-from-top-1">
            <div className="relative">
              <Mail className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Email"
                className="pl-9 text-xs"
                value={newMemberEmail}
                onChange={(e) => setNewMemberEmail(e.target.value)}
              />
            </div>
            <div className="relative">
              <Phone className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Phone"
                className="pl-9 text-xs"
                value={newMemberPhone}
                onChange={(e) => setNewMemberPhone(e.target.value)}
              />
            </div>
            <div className="relative">
              <Ticket className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Venmo ID"
                className="pl-9 text-xs"
                value={newMemberVenmoId}
                onChange={(e) => setNewMemberVenmoId(e.target.value)}
              />
            </div>
          </div>
        )}
      </div>

      {members.length > 0 && (
        <div className="space-y-1 pt-2 max-h-[200px] overflow-y-auto">
          <Label className="text-xs text-muted-foreground">Current Members</Label>
          {members.map((member, index) => (
            <div
              key={index}
              className="flex items-center justify-between p-2 bg-secondary/30 rounded text-sm"
            >
              <div className="flex flex-col">
                <span className="font-medium">{member.name}</span>
                <div className="flex gap-2 text-xs text-muted-foreground">
                  {member.email && (
                    <span className="flex items-center gap-0.5">
                      <Mail className="w-3 h-3" /> {member.email}
                    </span>
                  )}
                  {member.phoneNumber && (
                    <span className="flex items-center gap-0.5">
                      <Phone className="w-3 h-3" /> {member.phoneNumber}
                    </span>
                  )}
                  {member.venmoId && (
                    <span className="flex items-center gap-0.5">
                      <Ticket className="w-3 h-3" /> {member.venmoId}
                    </span>
                  )}
                  {!member.email && !member.phoneNumber && !member.venmoId && (
                    <span>No contact info</span>
                  )}
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleRemoveMember(index)}
                type="button"
                className="h-8 w-8 p-0"
              >
                <X className="w-4 h-4 text-muted-foreground" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Replace the member section in `SquadForm.tsx` with `SquadMembersEditor`**

Replace the entire content of `src/components/squads/SquadForm.tsx` with this slimmed version. The `SquadMembersEditor` takes over all member state.

```tsx
import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { SquadMember } from '@/types/squad.types';
import { SquadMembersEditor } from './SquadMembersEditor';

interface SquadFormProps {
  initialName?: string;
  initialDescription?: string;
  initialMembers?: SquadMember[];
  onSubmit: (name: string, description: string, members: SquadMember[]) => void;
  submitLabel?: string;
}

export function SquadForm({
  initialName = '',
  initialDescription = '',
  initialMembers = [],
  onSubmit,
  submitLabel = 'Create Squad',
}: SquadFormProps) {
  const [name, setName] = useState(initialName);
  const [description, setDescription] = useState(initialDescription);
  const [members, setMembers] = useState<SquadMember[]>(initialMembers);

  const isValid = name.trim().length > 0 && members.length >= 2;

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="squad-name">Squad Name *</Label>
        <Input
          id="squad-name"
          placeholder="e.g., College Friends, Roommates"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={50}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="squad-description">Description (Optional)</Label>
        <Textarea
          id="squad-description"
          placeholder="Add details about this squad..."
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
        />
      </div>

      <div className="space-y-2">
        <Label>Members *</Label>
        <SquadMembersEditor members={members} onChange={setMembers} />
      </div>

      <Button
        onClick={() => onSubmit(name, description, members)}
        variant="success"
        disabled={!isValid}
        className="w-full"
      >
        {submitLabel}
      </Button>
      {!isValid && members.length < 2 && (
        <p className="text-xs text-muted-foreground text-center">
          Add at least 2 members to create a squad
        </p>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Verify the existing Squads page still works**

Run the dev server and navigate to `/squads`. Create a squad, edit a squad, verify member add/remove looks identical to before.

```bash
npm run dev
```

Open http://localhost:8080/squads — confirm nothing changed visually.

- [ ] **Step 4: Commit**

```bash
git add src/components/squads/SquadMembersEditor.tsx src/components/squads/SquadForm.tsx
git commit -m "refactor: extract SquadMembersEditor from SquadForm"
```

---

### Task 2: Add `onCardClick` prop to `SquadList`

**Files:**
- Modify: `src/components/squads/SquadList.tsx`

- [ ] **Step 1: Update `SquadListProps` and `SquadCardProps` interfaces**

In `src/components/squads/SquadList.tsx`, make these changes:

1. Add `onCardClick?` to `SquadListProps`:

```tsx
interface SquadListProps {
  squads: HydratedSquad[];
  onEdit: (squad: HydratedSquad) => void;
  onDelete: (squadId: string) => void;
  onCardClick?: (squad: HydratedSquad) => void;
}
```

2. Pass it through in the `SquadList` component's map:

```tsx
export function SquadList({ squads, onEdit, onDelete, onCardClick }: SquadListProps) {
  if (squads.length === 0) {
    return <EmptySquadList />;
  }

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {squads.map((squad) => (
        <SquadCard
          key={squad.id}
          squad={squad}
          onEdit={() => onEdit(squad)}
          onDelete={() => onDelete(squad.id)}
          onCardClick={onCardClick ? () => onCardClick(squad) : undefined}
        />
      ))}
    </div>
  );
}
```

3. Add `onCardClick?` to `SquadCardProps` and use it in `SquadCard`:

```tsx
interface SquadCardProps {
  squad: HydratedSquad;
  onEdit: () => void;
  onDelete: () => void;
  onCardClick?: () => void;
}

function SquadCard({ squad, onEdit, onDelete, onCardClick }: SquadCardProps) {
  const navigate = useNavigate();

  return (
    <Card
      className="p-6 hover:shadow-lg transition-all duration-300 cursor-pointer"
      onClick={() => (onCardClick ? onCardClick() : navigate(`/squads/${squad.id}`))}
    >
```

Everything else in `SquadCard` stays the same.

- [ ] **Step 2: Verify `/squads` still navigates on card click**

With the dev server running, go to `/squads` and click a squad card — it should still navigate to `/squads/{id}` (since `onCardClick` is not passed from `SquadsView`).

- [ ] **Step 3: Commit**

```bash
git add src/components/squads/SquadList.tsx
git commit -m "feat: add optional onCardClick prop to SquadList"
```

---

### Task 3: Create `SquadMembersModal`

**Files:**
- Create: `src/components/squads/SquadMembersModal.tsx`

- [ ] **Step 1: Create the modal**

Create `src/components/squads/SquadMembersModal.tsx`:

```tsx
import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { HydratedSquad, SquadMember } from '@/types/squad.types';
import { SquadMembersEditor } from './SquadMembersEditor';

interface SquadMembersModalProps {
  squad: HydratedSquad;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (members: SquadMember[]) => Promise<void>;
}

export function SquadMembersModal({
  squad,
  open,
  onOpenChange,
  onSave,
}: SquadMembersModalProps) {
  const [members, setMembers] = useState<SquadMember[]>(squad.members);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    await onSave(members);
    setSaving(false);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{squad.name}</DialogTitle>
          <p className="text-sm text-muted-foreground">Manage members</p>
        </DialogHeader>
        <SquadMembersEditor members={members} onChange={setMembers} />
        <Button
          onClick={handleSave}
          variant="success"
          disabled={members.length < 2 || saving}
          className="w-full"
        >
          {saving ? 'Saving...' : 'Save Changes'}
        </Button>
        {members.length < 2 && (
          <p className="text-xs text-muted-foreground text-center">
            A squad needs at least 2 members
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/squads/SquadMembersModal.tsx
git commit -m "feat: add SquadMembersModal for editing squad members"
```

---

### Task 4: Create `SquadsSettingsCard`

**Files:**
- Create: `src/components/settings/SquadsSettingsCard.tsx`

- [ ] **Step 1: Create the card**

Create `src/components/settings/SquadsSettingsCard.tsx`. This mirrors `SquadsView` logic but uses `useSquadManager` directly (no `useSquadEditor`) and manages its own dialog state.

```tsx
import { useState } from 'react';
import { Users, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useSquadManager } from '@/hooks/useSquadManager';
import { SquadList } from '@/components/squads/SquadList';
import { SquadForm } from '@/components/squads/SquadForm';
import { SquadMembersModal } from '@/components/squads/SquadMembersModal';
import { HydratedSquad, SquadMember } from '@/types/squad.types';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

export function SquadsSettingsCard() {
  const { squads, loading, createSquad, updateSquad, deleteSquad } = useSquadManager();

  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editingSquad, setEditingSquad] = useState<HydratedSquad | null>(null);
  const [membersSquad, setMembersSquad] = useState<HydratedSquad | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);

  const handleCreate = async (name: string, desc: string, members: SquadMember[]) => {
    const id = await createSquad({ name, description: desc, members });
    if (id) setCreateDialogOpen(false);
  };

  const handleUpdate = async (name: string, desc: string, members: SquadMember[]) => {
    if (!editingSquad) return;
    const ok = await updateSquad(editingSquad.id, { name, description: desc, members });
    if (ok) setEditingSquad(null);
  };

  const handleSaveMembers = async (members: SquadMember[]) => {
    if (!membersSquad) return;
    await updateSquad(membersSquad.id, { members });
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    await deleteSquad(deleteTarget.id);
    setDeleteTarget(null);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">My Squads</h3>
          <p className="text-sm text-muted-foreground">
            {squads.length} {squads.length === 1 ? 'squad' : 'squads'}
          </p>
        </div>
        <Button
          size="icon"
          className="rounded-full h-10 w-10"
          onClick={() => setCreateDialogOpen(true)}
        >
          <Plus className="w-6 h-6" />
        </Button>
      </div>

      {loading ? (
        <Card className="p-8 space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex items-center gap-3 animate-pulse">
              <div className="w-10 h-10 rounded-full bg-muted" />
              <div className="flex-1 space-y-2">
                <div className="h-4 bg-muted rounded w-1/3" />
                <div className="h-3 bg-muted rounded w-1/2" />
              </div>
            </div>
          ))}
        </Card>
      ) : squads.length === 0 ? (
        <Card className="p-8 text-center space-y-4">
          <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
            <Users className="w-8 h-8 text-primary" />
          </div>
          <h3 className="text-lg font-semibold">No squads yet</h3>
          <p className="text-muted-foreground">
            Create a squad to easily split bills with the same group of people.
          </p>
          <Button onClick={() => setCreateDialogOpen(true)}>Create Squad</Button>
        </Card>
      ) : (
        <SquadList
          squads={squads}
          onEdit={(squad) => setEditingSquad(squad)}
          onDelete={(id) => {
            const squad = squads.find((s) => s.id === id);
            if (squad) setDeleteTarget({ id, name: squad.name });
          }}
          onCardClick={(squad) => setMembersSquad(squad)}
        />
      )}

      {/* Create dialog */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New Squad</DialogTitle>
          </DialogHeader>
          <SquadForm onSubmit={handleCreate} submitLabel="Create" />
        </DialogContent>
      </Dialog>

      {/* Edit dialog */}
      <Dialog
        open={!!editingSquad}
        onOpenChange={(open) => { if (!open) setEditingSquad(null); }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Squad</DialogTitle>
          </DialogHeader>
          {editingSquad && (
            <SquadForm
              initialName={editingSquad.name}
              initialDescription={editingSquad.description}
              initialMembers={editingSquad.members}
              onSubmit={handleUpdate}
              submitLabel="Update"
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Members modal — key ensures fresh state per squad */}
      {membersSquad && (
        <SquadMembersModal
          key={membersSquad.id}
          squad={membersSquad}
          open={!!membersSquad}
          onOpenChange={(open) => { if (!open) setMembersSquad(null); }}
          onSave={handleSaveMembers}
        />
      )}

      {/* Delete confirmation */}
      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Squad</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{deleteTarget?.name}"? This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-destructive hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/settings/SquadsSettingsCard.tsx
git commit -m "feat: add SquadsSettingsCard for settings tab"
```

---

### Task 5: Add Squads tab to `SettingsView`

**Files:**
- Modify: `src/pages/SettingsView.tsx`

- [ ] **Step 1: Update `SettingsView.tsx`**

Replace the entire content of `src/pages/SettingsView.tsx`:

```tsx
import { useState } from 'react';
import { Settings, Users, History, Shield } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useIsMobile } from '@/hooks/use-mobile';
import { ProfileSettingsCard } from '@/components/profile/ProfileSettingsCard';
import { ManageFriendsCard } from '@/components/profile/ManageFriendsCard';
import { SettlementHistoryCard } from '@/components/settings/SettlementHistoryCard';
import { SquadsSettingsCard } from '@/components/settings/SquadsSettingsCard';
import { useLocation } from 'react-router-dom';

export default function SettingsView() {
  const isMobile = useIsMobile();
  const location = useLocation();
  const [activeTab, setActiveTab] = useState(location.state?.defaultTab || 'profile');

  return (
    <div className="space-y-4 md:space-y-6 animate-fade-in">
      <div className="space-y-2">
        <h2 className="text-2xl md:text-4xl font-bold bg-gradient-to-r from-primary via-primary-glow to-accent bg-clip-text text-transparent">
          Settings
        </h2>
        <p className="text-sm md:text-lg text-muted-foreground">
          Manage your profile, friends, and squads
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="profile" className="gap-1 text-xs md:gap-2 md:text-sm">
            <Settings className="w-3 h-3 md:w-4 md:h-4" />
            <span>Profile</span>
          </TabsTrigger>
          <TabsTrigger value="friends" className="gap-1 text-xs md:gap-2 md:text-sm">
            <Users className="w-3 h-3 md:w-4 md:h-4" />
            <span>Friends</span>
          </TabsTrigger>
          <TabsTrigger value="history" className="gap-1 text-xs md:gap-2 md:text-sm">
            <History className="w-3 h-3 md:w-4 md:h-4" />
            <span>History</span>
          </TabsTrigger>
          <TabsTrigger value="squads" className="gap-1 text-xs md:gap-2 md:text-sm">
            <Shield className="w-3 h-3 md:w-4 md:h-4" />
            <span>Squads</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="profile" className="mt-4 md:mt-6">
          <ProfileSettingsCard />
        </TabsContent>

        <TabsContent value="friends" className="mt-4 md:mt-6">
          <ManageFriendsCard />
        </TabsContent>

        <TabsContent value="history" className="mt-4 md:mt-6">
          <SettlementHistoryCard />
        </TabsContent>

        <TabsContent value="squads" className="mt-4 md:mt-6">
          <SquadsSettingsCard />
        </TabsContent>
      </Tabs>
    </div>
  );
}
```

Note: `isMobile` is no longer used after this change — remove it if the linter flags it (the original file imported it but didn't appear to use it either).

- [ ] **Step 2: Verify end-to-end in the browser**

With `npm run dev` running, go to http://localhost:8080/settings:
- Confirm 4 tabs appear: Profile, Friends, History, Squads
- Click "Squads" tab — squad list should load
- Click a squad card → members modal opens with correct member list
- Add a member, save → toast confirms update, modal closes
- Remove a member, save → same
- Click pencil icon → edit dialog opens (full form with name/description/members)
- Click trash icon → delete confirmation appears
- Click "+ New Squad" button → create dialog opens
- Verify `/squads` page is still fully functional (untouched)

- [ ] **Step 3: Commit**

```bash
git add src/pages/SettingsView.tsx
git commit -m "feat: add Squads tab to Settings page"
```
