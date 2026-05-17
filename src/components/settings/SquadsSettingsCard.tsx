import { useState } from 'react';
import { Users, Plus, Shield } from 'lucide-react';
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

  const handleSaveMembers = async (members: SquadMember[]): Promise<boolean> => {
    if (!membersSquad) return false;
    return await updateSquad(membersSquad.id, { members });
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    await deleteSquad(deleteTarget.id);
    setDeleteTarget(null);
  };

  return (
    <Card className="p-4 md:p-6">
      <div className="flex items-center justify-between mb-4 md:mb-6">
        <div className="flex items-center gap-2">
          <Shield className="w-5 h-5 md:w-6 md:h-6 text-primary" />
          <h2 className="text-xl md:text-2xl font-semibold">My Squads</h2>
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
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex items-center gap-3 animate-pulse">
              <div className="w-10 h-10 rounded-full bg-muted" />
              <div className="flex-1 space-y-2">
                <div className="h-4 bg-muted rounded w-1/3" />
                <div className="h-3 bg-muted rounded w-1/2" />
              </div>
            </div>
          ))}
        </div>
      ) : squads.length === 0 ? (
        <div className="py-8 text-center space-y-4">
          <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
            <Users className="w-8 h-8 text-primary" />
          </div>
          <h3 className="text-lg font-semibold">No squads yet</h3>
          <p className="text-muted-foreground">
            Create a squad to easily split bills with the same group of people.
          </p>
          <Button onClick={() => setCreateDialogOpen(true)}>Create Squad</Button>
        </div>
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
    </Card>
  );
}
