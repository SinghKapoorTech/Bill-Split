import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

interface CreateEventDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreateEvent: (name: string, description: string) => void;
}

export function CreateEventDialog({ open, onOpenChange, onCreateEvent }: CreateEventDialogProps) {
  const [eventName, setEventName] = useState('');
  const [description, setDescription] = useState('');

  const handleCreate = () => {
    if (!eventName.trim()) return;

    onCreateEvent(eventName.trim(), description.trim());

    // Reset form
    setEventName('');
    setDescription('');
    onOpenChange(false);
  };

  const handleCancel = () => {
    setEventName('');
    setDescription('');
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Create New Event</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="event-name">Event Name *</Label>
            <Input
              id="event-name"
              placeholder="e.g., Vegas Weekend, Ski Trip 2026, Game Night"
              value={eventName}
              onChange={(e) => setEventName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
              autoFocus
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description (Optional)</Label>
            <Textarea
              id="description"
              placeholder="Add details about this event..."
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
          <Button variant="success" onClick={handleCreate} disabled={!eventName.trim()}>
            Create Event
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
