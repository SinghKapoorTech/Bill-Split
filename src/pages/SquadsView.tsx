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
import { useState } from 'react';

export default function SquadsView() {
  const navigate = useNavigate();
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
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
    // We can use the same dialog for editing if better, 
    // or just navigate to a detail view if that existed.
    // For now, let's open the create dialog in 'edit' mode or similar, 
    // but SquadForm handles editing if we pass initial data. 
    // Simplified: Just use the hook's handleEdit to set state, and maybe open a dialog?
    // The useSquadEditor hook seems to be designed for the tabs view. 
    // Let's adapt it.
    handleEdit(squad);
    setCreateDialogOpen(true);
  };

  const onUpdateSquad = async (name: string, description: string, members: any[]) => {
      // The hook's handleUpdate relies on 'editingSquad' state.
      // We need to confirm if useSquadEditor exposes handleUpdate directly or we need to wrap it.
      // Checking usage in ManageSquadsCard... it imports handleUpdate.
      // So we can assume it's available.
      // We'll need to pass this to SquadForm.
      // However, managing the "Edit" state vs "Create" state in one dialog might be tricky if the hook doesn't support it cleanly.
      
      // Actually, looking at ManageSquadsCard, it switches tabs.
      // Here we want a list view and a dialog for create/edit.
  };

  return (
    <div className="container mx-auto px-4 py-8 max-w-lg mb-20">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold">My Squads</h1>
          <p className="text-muted-foreground">Manage your groups</p>
        </div>
        <Dialog open={createDialogOpen} onOpenChange={(open) => {
            setCreateDialogOpen(open);
            if (!open) handleTabChange('list'); // Clear editing state on close
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
            onDelete={handleDelete} 
        />
      )}
    </div>
  );
}
