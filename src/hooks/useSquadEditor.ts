import { useState } from 'react';
import { useSquadManager } from './useSquadManager';
import { Squad, HydratedSquad, SquadMember, CreateSquadInput } from '@/types/squad.types';

export function useSquadEditor() {
  const { squads, loading, createSquad, updateSquad, deleteSquad } = useSquadManager();
  const [activeTab, setActiveTab] = useState<'list' | 'create' | 'edit'>('list');
  const [editingSquad, setEditingSquad] = useState<HydratedSquad | null>(null);

  const handleCreate = async (name: string, description: string, members: SquadMember[]) => {
    const input: CreateSquadInput = { name, description, members };
    const squadId = await createSquad(input);

    if (squadId) {
      setActiveTab('list');
    }
  };

  const handleEdit = (squad: HydratedSquad) => {
    setEditingSquad(squad);
    setActiveTab('edit');
  };

  const handleUpdate = async (name: string, description: string, members: SquadMember[]) => {
    if (!editingSquad) return;

    const success = await updateSquad(editingSquad.id, { name, description, members });

    if (success) {
      setEditingSquad(null);
      setActiveTab('list');
    }
  };

  const handleDelete = async (squadId: string) => {
    const confirmed = window.confirm('Are you sure you want to delete this squad?');
    if (confirmed) {
      await deleteSquad(squadId);
    }
  };

  const handleTabChange = (value: string) => {
    setActiveTab(value as 'list' | 'create' | 'edit');
    if (value === 'list') {
      setEditingSquad(null);
    }
  };

  return {
    // Data
    squads,
    loading,
    activeTab,
    editingSquad,

    // Actions
    handleCreate,
    handleEdit,
    handleUpdate,
    handleDelete,
    handleTabChange,
    setActiveTab,
  };
}
