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
