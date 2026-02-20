import { useState } from 'react';
import { Edit2, Check, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useUserProfile } from '@/hooks/useUserProfile';

interface UserVenmoIdEditorProps {
  currentVenmoId?: string;
}

export function UserVenmoIdEditor({ currentVenmoId }: UserVenmoIdEditorProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [venmoId, setVenmoId] = useState(currentVenmoId || '');
  const { updateVenmoId } = useUserProfile();

  const handleSave = async () => {
    await updateVenmoId(venmoId.trim());
    setIsEditing(false);
  };

  const handleCancel = () => {
    setVenmoId(currentVenmoId || '');
    setIsEditing(false);
  };

  if (!isEditing) {
    return (
      <div className="flex items-center gap-2">
        {currentVenmoId ? (
          <span className="text-xs text-muted-foreground">
            (@{currentVenmoId.replace(/^@+/, '')})
          </span>
        ) : (
          <span className="text-xs text-muted-foreground italic">
            No Venmo ID
          </span>
        )}
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setIsEditing(true)}
          className="h-6 w-6 p-0"
          title="Edit Venmo ID"
        >
          <Edit2 className="w-3 h-3" />
        </Button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1">
      <Input
        value={venmoId}
        onChange={(e) => setVenmoId(e.target.value)}
        placeholder="Venmo username"
        className="h-7 text-xs w-32"
        autoFocus
        onKeyDown={(e) => {
          if (e.key === 'Enter') handleSave();
          if (e.key === 'Escape') handleCancel();
        }}
      />
      <Button
        variant="ghost"
        size="sm"
        onClick={handleSave}
        className="h-6 w-6 p-0 text-green-600 hover:text-green-700"
        title="Save"
      >
        <Check className="w-3 h-3" />
      </Button>
      <Button
        variant="ghost"
        size="sm"
        onClick={handleCancel}
        className="h-6 w-6 p-0 text-red-600 hover:text-red-700"
        title="Cancel"
      >
        <X className="w-3 h-3" />
      </Button>
    </div>
  );
}
