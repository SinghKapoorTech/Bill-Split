import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

interface CreateTripDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreateTrip: (name: string, description: string) => void;
}

export function CreateTripDialog({ open, onOpenChange, onCreateTrip }: CreateTripDialogProps) {
  const [tripName, setTripName] = useState('');
  const [description, setDescription] = useState('');

  const handleCreate = () => {
    if (!tripName.trim()) return;

    onCreateTrip(tripName.trim(), description.trim());

    // Reset form
    setTripName('');
    setDescription('');
    onOpenChange(false);
  };

  const handleCancel = () => {
    setTripName('');
    setDescription('');
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Create New Trip</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="trip-name">Trip Name *</Label>
            <Input
              id="trip-name"
              placeholder="e.g., Vegas Weekend, Ski Trip 2026, Game Night"
              value={tripName}
              onChange={(e) => setTripName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
              autoFocus
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description (Optional)</Label>
            <Textarea
              id="description"
              placeholder="Add details about this trip..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
            />
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={handleCancel}>
            Cancel
          </Button>
          <Button variant="success" onClick={handleCreate} disabled={!tripName.trim()}>
            Create Trip
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
