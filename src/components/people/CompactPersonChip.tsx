import { useState, useEffect } from 'react';
import { Heart, X } from 'lucide-react';
import { Person } from '@/types';
import { UserVenmoIdEditor } from './UserVenmoIdEditor';
import { EditPersonDialog } from './EditPersonDialog';
import { SaveFriendDialog } from './SaveFriendDialog';

interface CompactPersonChipProps {
  person: Person;
  isCurrentUser: boolean;
  isInFriends: boolean;
  onRemove: (personId: string) => void;
  onUpdate: (personId: string, updates: Partial<Person>) => Promise<void>;
  onSaveAsFriend: (person: Person, contactInfo?: string) => void;
  onRemoveFriend?: (person: Person) => void;
  existingNames: string[];
}

export function CompactPersonChip({
  person,
  isCurrentUser,
  isInFriends,
  onRemove,
  onUpdate,
  onSaveAsFriend,
  onRemoveFriend,
  existingNames,
}: CompactPersonChipProps) {
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isSaveFriendDialogOpen, setIsSaveFriendDialogOpen] = useState(false);
  const [optimisticIsFriend, setOptimisticIsFriend] = useState(isInFriends);

  useEffect(() => {
    setOptimisticIsFriend(isInFriends);
  }, [isInFriends]);

  const isManualEntry = person.id.startsWith('person-');

  const handleUpdate = async (updates: Partial<Person>) => {
    if (updates.venmoId) {
      updates.venmoId = updates.venmoId.replace(/^@+/, '').trim();
    }
    await onUpdate(person.id, updates);
  };

  const handleNameTap = () => {
    if (isManualEntry) {
      setIsEditDialogOpen(true);
    }
  };

  return (
    <div
      className={`flex items-center gap-2 py-1.5 px-2 rounded-lg ${
        isCurrentUser
          ? 'bg-primary/10 border border-primary/20'
          : 'bg-secondary/30'
      }`}
    >
      {/* Avatar initial */}
      <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 ${
        isCurrentUser ? 'bg-primary' : 'bg-muted-foreground/20'
      }`}>
        <span className={`text-[10px] font-bold ${
          isCurrentUser ? 'text-primary-foreground' : 'text-foreground'
        }`}>
          {person.name.charAt(0).toUpperCase()}
        </span>
      </div>

      {/* Name + venmo */}
      <div className="flex-1 min-w-0 flex items-center gap-1.5">
        <button
          type="button"
          onClick={handleNameTap}
          className={`text-sm font-medium truncate ${isManualEntry ? 'hover:underline' : ''}`}
          disabled={!isManualEntry}
        >
          {person.name}
        </button>
        {isCurrentUser && (
          <span className="px-1.5 py-0.5 text-[10px] font-semibold bg-primary text-primary-foreground rounded-full flex-shrink-0">
            You
          </span>
        )}
        {isCurrentUser ? (
          <UserVenmoIdEditor currentVenmoId={person.venmoId} />
        ) : (
          person.venmoId && (
            <span className="text-xs text-muted-foreground truncate">
              @{person.venmoId.replace(/^@+/, '')}
            </span>
          )
        )}
      </div>

      {/* Actions */}
      {!isCurrentUser && (
        <div className="flex items-center gap-0.5 flex-shrink-0">
          <button
            type="button"
            onClick={() => {
              if (optimisticIsFriend) {
                setOptimisticIsFriend(false);
                onRemoveFriend?.(person);
              } else {
                if (isManualEntry) {
                  setIsSaveFriendDialogOpen(true);
                } else {
                  setOptimisticIsFriend(true);
                  onSaveAsFriend(person);
                }
              }
            }}
            className="p-1 rounded-md hover:bg-muted/50 transition-colors"
            title={optimisticIsFriend ? 'Remove friend' : 'Save as friend'}
          >
            <Heart className={`w-3.5 h-3.5 text-red-500 ${optimisticIsFriend ? 'fill-red-500' : ''}`} />
          </button>
          <button
            type="button"
            onClick={() => onRemove(person.id)}
            className="p-1 rounded-md hover:bg-muted/50 transition-colors"
            title="Remove person"
          >
            <X className="w-3.5 h-3.5 text-muted-foreground" />
          </button>
        </div>
      )}

      <EditPersonDialog
        isOpen={isEditDialogOpen}
        onClose={() => setIsEditDialogOpen(false)}
        person={person}
        onSave={handleUpdate}
        existingNames={existingNames}
      />

      <SaveFriendDialog
        isOpen={isSaveFriendDialogOpen}
        onClose={() => setIsSaveFriendDialogOpen(false)}
        person={person}
        onSave={(contactInfo) => {
          setOptimisticIsFriend(true);
          onSaveAsFriend(person, contactInfo);
        }}
      />
    </div>
  );
}
