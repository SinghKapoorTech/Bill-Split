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
import { useAuth } from '@/contexts/AuthContext';

interface SquadMembersModalProps {
  squad: HydratedSquad;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (members: SquadMember[]) => Promise<boolean>;
}

export function SquadMembersModal({
  squad,
  open,
  onOpenChange,
  onSave,
}: SquadMembersModalProps) {
  const { user } = useAuth();
  const [members, setMembers] = useState<SquadMember[]>(squad.members);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    const ok = await onSave(members);
    setSaving(false);
    if (ok) onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="top-[10%] translate-y-0">
        <DialogHeader>
          <DialogTitle>{squad.name}</DialogTitle>
          <p className="text-sm text-muted-foreground">Manage members</p>
        </DialogHeader>
        <SquadMembersEditor members={members} onChange={setMembers} excludeUserId={user?.uid} />
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
