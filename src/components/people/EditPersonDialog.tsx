import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Person } from '@/types/person.types';

interface EditPersonDialogProps {
  isOpen: boolean;
  onClose: () => void;
  person: Person;
  onSave: (updates: Partial<Person>) => Promise<void>;
  existingNames: string[];
}

export function EditPersonDialog({ 
  isOpen, 
  onClose, 
  person, 
  onSave,
  existingNames = []
}: EditPersonDialogProps) {
  const [name, setName] = useState(person.name);
  const [venmoId, setVenmoId] = useState(person.venmoId || '');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset form when person changes or dialog opens
  useEffect(() => {
    if (isOpen) {
      setName(person.name);
      setVenmoId(person.venmoId || '');
      setError(null);
    }
  }, [isOpen, person]);

  const handleSave = async () => {
    const trimmedName = name.trim();
    if (!trimmedName) return;

    // Check for duplicates (case-insensitive)
    // We filter out the current person's name from the check if they haven't changed it
    if (trimmedName.toLowerCase() !== person.name.toLowerCase() && 
        existingNames.some(n => n.toLowerCase() === trimmedName.toLowerCase())) {
      setError('This name is already taken.');
      return;
    }
    
    try {
      setIsSaving(true);
      setError(null);
      await onSave({
        name: trimmedName,
        venmoId: venmoId.trim() || undefined
      });
      onClose();
    } catch (error) {
      console.error("Failed to update person:", error);
      setError('Failed to save changes.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !isSaving && !open && onClose()}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Edit Profile</DialogTitle>
          <DialogDescription>
            Update your details for this bill.
          </DialogDescription>
        </DialogHeader>
        
        <div className="grid gap-4 py-4">
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="name" className="text-right">
              Name
            </Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setError(null);
              }}
              className="col-span-3"
              disabled={isSaving}
            />
            {error && <p className="col-start-2 col-span-3 text-sm text-destructive">{error}</p>}
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="venmo" className="text-right">
              Venmo
            </Label>
            <Input
              id="venmo"
              value={venmoId}
              onChange={(e) => setVenmoId(e.target.value)}
              placeholder="@username (optional)"
              className="col-span-3"
              disabled={isSaving}
            />
          </div>
        </div>
        
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isSaving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!name.trim() || isSaving}>
            {isSaving ? 'Saving...' : 'Save Changes'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
