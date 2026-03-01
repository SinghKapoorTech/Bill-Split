import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { AddAppUserDialog, SelectedMember } from './AddAppUserDialog';
import { UserPlus, X } from 'lucide-react';

interface CreateEventDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreateEvent: (name: string, description: string, memberIds: string[], pendingEmails: string[]) => void;
}

export function CreateEventDialog({ open, onOpenChange, onCreateEvent }: CreateEventDialogProps) {
  const [eventName, setEventName] = useState('');
  const [description, setDescription] = useState('');
  const [selectedMembers, setSelectedMembers] = useState<SelectedMember[]>([]);
  const [isAppUserDialogOpen, setIsAppUserDialogOpen] = useState(false);

  const handleCreate = () => {
    if (!eventName.trim() || selectedMembers.length === 0) return;

    const memberIds = selectedMembers.filter(m => m.id).map(m => m.id as string);
    const pendingEmails = selectedMembers.filter(m => !m.id && m.email).map(m => m.email as string);

    onCreateEvent(eventName.trim(), description.trim(), memberIds, pendingEmails);

    // Reset form
    setEventName('');
    setDescription('');
    setSelectedMembers([]);
    onOpenChange(false);
  };

  const handleCancel = () => {
    setEventName('');
    setDescription('');
    setSelectedMembers([]);
    onOpenChange(false);
  };

  const removeMember = (memberIdOrEmail: string) => {
    setSelectedMembers(prev => prev.filter(m => (m.id || m.email) !== memberIdOrEmail));
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
            />
          </div>

          <div className="space-y-4">
            <div>
              <Label htmlFor="description">Description (Optional)</Label>
              <Textarea
                id="description"
                placeholder="Add details about this event..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
                className="mt-1"
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Required Members *</Label>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setIsAppUserDialogOpen(true)}
                  className="h-8 gap-2"
                >
                  <UserPlus className="w-4 h-4" />
                  Add Member
                </Button>
              </div>
              
              {selectedMembers.length === 0 ? (
                <div className="text-sm text-muted-foreground p-3 bg-muted/50 rounded-md border border-dashed text-center">
                  You must add at least one member to create an event.
                </div>
              ) : (
                <div className="space-y-2 max-h-[150px] overflow-y-auto pr-1">
                  {selectedMembers.map((member, idx) => (
                    <div
                      key={member.id || member.email || idx}
                      className="flex items-center justify-between p-2 rounded-md border bg-card text-sm"
                    >
                      <div className="flex flex-col">
                        <span className="font-medium">{member.name}</span>
                        {member.email && !member.id && (
                          <span className="text-xs text-muted-foreground">Will be invited via email</span>
                        )}
                        {member.username && (
                          <span className="text-xs text-muted-foreground">@{member.username}</span>
                        )}
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-destructive shrink-0"
                        onClick={() => removeMember((member.id || member.email) as string)}
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={handleCancel}>
            Cancel
          </Button>
          <Button 
            variant="success" 
            onClick={handleCreate} 
            disabled={!eventName.trim() || selectedMembers.length === 0}
          >
            Create Event
          </Button>
        </DialogFooter>
      </DialogContent>

      <AddAppUserDialog
        open={isAppUserDialogOpen}
        onOpenChange={setIsAppUserDialogOpen}
        onAddAppUser={(member) => {
          if (!selectedMembers.some(m => (m.id === member.id && m.id) || (m.email === member.email && m.email))) {
            setSelectedMembers(prev => [...prev, member]);
          }
        }}
        alreadySelectedIds={selectedMembers.filter(m => m.id).map(m => m.id as string)}
      />
    </Dialog>
  );
}
