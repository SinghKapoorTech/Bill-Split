import { useNavigate } from 'react-router-dom';
import { Users, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useSquadEditor } from '@/hooks/useSquadEditor';
import { SquadList } from '@/components/squads/SquadList';
import { SquadForm } from '@/components/squads/SquadForm';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useState } from 'react';

export default function SquadsView() {
  const navigate = useNavigate();
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [squadToDelete, setSquadToDelete] = useState<{ id: string; name: string } | null>(null);
  const {
    squads,
    loading,
    handleCreate,
    handleEdit,
    handleUpdate,
    handleDelete,
    editingSquad,
    handleTabChange
  } = useSquadEditor();

  const onEditSquad = (squad: any) => {
    handleEdit(squad);
    setCreateDialogOpen(true);
  };

  const onDeleteSquad = (squadId: string) => {
    const squad = squads.find(s => s.id === squadId);
    if (!squad) return;
    setSquadToDelete({ id: squadId, name: squad.name });
    setDeleteDialogOpen(true);
  };

  const confirmDelete = async () => {
    if (!squadToDelete) return;
    await handleDelete(squadToDelete.id);
    setDeleteDialogOpen(false);
    setSquadToDelete(null);
  };

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl mb-20">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold">My Squads</h1>
          <p className="text-muted-foreground">Manage your squads</p>
        </div>
        <Dialog open={createDialogOpen} onOpenChange={(open) => {
            setCreateDialogOpen(open);
            if (!open) handleTabChange('list');
        }}>
          <DialogTrigger asChild>
            <Button size="icon" className="rounded-full h-10 w-10">
              <Plus className="w-6 h-6" />
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editingSquad ? 'Edit Squad' : 'Create New Squad'}</DialogTitle>
            </DialogHeader>
            <SquadForm 
                initialName={editingSquad?.name}
                initialDescription={editingSquad?.description}
                initialMembers={editingSquad?.members}
                onSubmit={async (name, desc, members) => {
                    if (editingSquad) {
                        await handleUpdate(name, desc, members);
                    } else {
                        await handleCreate(name, desc, members);
                    }
                    setCreateDialogOpen(false);
                }}
                submitLabel={editingSquad ? 'Update' : 'Create'}
            />
          </DialogContent>
        </Dialog>
      </div>

      {loading ? (
        <div className="text-center py-12 text-muted-foreground">Loading squads...</div>
      ) : squads.length === 0 ? (
        <Card className="p-8 text-center space-y-4">
          <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
            <Users className="w-8 h-8 text-primary" />
          </div>
          <h3 className="text-lg font-semibold">No squads yet</h3>
          <p className="text-muted-foreground">
            Create a squad to easily split bills with the same group of people.
          </p>
          <Button onClick={() => setCreateDialogOpen(true)}>
            Create Squad
          </Button>
        </Card>
      ) : (
        <SquadList 
            squads={squads} 
            onEdit={onEditSquad} 
            onDelete={onDeleteSquad} 
        />
      )}

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Squad</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{squadToDelete?.name}"? This cannot be undone.
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
    </div>
  );
}
