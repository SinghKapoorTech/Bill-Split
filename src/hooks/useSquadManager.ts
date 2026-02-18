import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from './use-toast';
import { Squad, HydratedSquad, CreateSquadInput, UpdateSquadInput } from '@/types/squad.types';
import {
  fetchUserSquads,
  saveSquad,
  updateSquad,
  deleteSquad,
  getSquadById,
} from '@/services/squadService';
import { validateSquadName, validateSquadMembers } from '@/utils/squadUtils';

export function useSquadManager() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [squads, setSquads] = useState<HydratedSquad[]>([]);
  const [loading, setLoading] = useState(true);

  /**
   * Loads squads from Firestore
   */
  const loadSquads = useCallback(async () => {
    if (!user) {
      setSquads([]);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const userSquads = await fetchUserSquads(user.uid);
      setSquads(userSquads);
    } catch (error) {
      console.error('Error loading squads:', error);
      toast({
        title: 'Error loading squads',
        description: 'Could not load your squads. Please try again.',
        variant: 'destructive',
      });
      setSquads([]);
    } finally {
      setLoading(false);
    }
  }, [user, toast]);

  /**
   * Creates a new squad
   */
  const createSquad = useCallback(
    async (input: CreateSquadInput): Promise<string | null> => {
      if (!user) {
        toast({
          title: 'Authentication required',
          description: 'Please sign in to create a squad.',
          variant: 'destructive',
        });
        return null;
      }

      // Validation
      if (!validateSquadName(input.name)) {
        toast({
          title: 'Invalid squad name',
          description: 'Squad name must be between 1 and 50 characters.',
          variant: 'destructive',
        });
        return null;
      }

      if (!validateSquadMembers(input.members)) {
        toast({
          title: 'Invalid members',
          description: 'A squad must have at least 2 members with valid names.',
          variant: 'destructive',
        });
        return null;
      }

      try {
        const squadId = await saveSquad(user.uid, input);
        await loadSquads();

        toast({
          title: 'Squad created',
          description: `"${input.name}" has been saved successfully.`,
        });

        return squadId;
      } catch (error) {
        console.error('Error creating squad:', error);
        toast({
          title: 'Error creating squad',
          description: 'Could not create squad. Please try again.',
          variant: 'destructive',
        });
        return null;
      }
    },
    [user, toast, loadSquads]
  );

  /**
   * Updates an existing squad
   */
  const updateSquadData = useCallback(
    async (squadId: string, updates: UpdateSquadInput): Promise<boolean> => {
      if (!user) {
        toast({
          title: 'Authentication required',
          description: 'Please sign in to update a squad.',
          variant: 'destructive',
        });
        return false;
      }

      // Validation
      if (updates.name !== undefined && !validateSquadName(updates.name)) {
        toast({
          title: 'Invalid squad name',
          description: 'Squad name must be between 1 and 50 characters.',
          variant: 'destructive',
        });
        return false;
      }

      if (updates.members !== undefined && !validateSquadMembers(updates.members)) {
        toast({
          title: 'Invalid members',
          description: 'A squad must have at least 2 members with valid names.',
          variant: 'destructive',
        });
        return false;
      }

      try {
        await updateSquad(user.uid, squadId, updates);
        await loadSquads();

        toast({
          title: 'Squad updated',
          description: 'Your squad has been updated successfully.',
        });

        return true;
      } catch (error) {
        console.error('Error updating squad:', error);
        toast({
          title: 'Error updating squad',
          description: 'Could not update squad. Please try again.',
          variant: 'destructive',
        });
        return false;
      }
    },
    [user, toast, loadSquads]
  );

  /**
   * Deletes a squad
   */
  const deleteSquadData = useCallback(
    async (squadId: string): Promise<boolean> => {
      if (!user) {
        toast({
          title: 'Authentication required',
          description: 'Please sign in to delete a squad.',
          variant: 'destructive',
        });
        return false;
      }

      try {
        await deleteSquad(user.uid, squadId);
        await loadSquads();

        toast({
          title: 'Squad deleted',
          description: 'Your squad has been deleted successfully.',
        });

        return true;
      } catch (error) {
        console.error('Error deleting squad:', error);
        toast({
          title: 'Error deleting squad',
          description: 'Could not delete squad. Please try again.',
          variant: 'destructive',
        });
        return false;
      }
    },
    [user, toast, loadSquads]
  );

  /**
   * Finds a squad by ID
   */
  const findSquadById = useCallback(
    (squadId: string): HydratedSquad | undefined => {
      return squads.find(s => s.id === squadId);
    },
    [squads]
  );

  /**
   * Gets a squad by ID (async version that fetches from Firestore)
   */
  const getSquad = useCallback(
    async (squadId: string): Promise<HydratedSquad | null> => {
      if (!user) return null;

      try {
        return await getSquadById(user.uid, squadId);
      } catch (error) {
        console.error('Error fetching squad:', error);
        toast({
          title: 'Error loading squad',
          description: 'Could not load squad details.',
          variant: 'destructive',
        });
        return null;
      }
    },
    [user, toast]
  );

  // Load squads on mount and when user changes
  useEffect(() => {
    loadSquads();
  }, [loadSquads]);

  return {
    squads,
    loading,
    loadSquads,
    createSquad,
    updateSquad: updateSquadData,
    deleteSquad: deleteSquadData,
    findSquadById,
    getSquad,
  };
}
