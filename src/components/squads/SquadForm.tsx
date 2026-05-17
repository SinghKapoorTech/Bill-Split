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
