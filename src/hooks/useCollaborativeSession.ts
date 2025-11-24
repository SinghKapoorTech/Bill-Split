import { useState, useEffect, useCallback } from 'react';
import {
  doc,
  onSnapshot,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '@/config/firebase';
import { useAuth } from '@/contexts/AuthContext';
import { Bill } from '@/types/bill.types';
import { billService } from '@/services/billService';
import { useToast } from './use-toast';

/**
 * Hook for managing a collaborative session (Bill) with real-time updates
 * @param billId - The bill ID
 * @returns Session state and update functions
 */
export function useCollaborativeSession(billId: string | null) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [session, setSession] = useState<Bill | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Real-time listener for the bill
  useEffect(() => {
    if (!billId) {
      setIsLoading(false);
      setSession(null);
      return;
    }

    const billRef = doc(db, 'bills', billId);

    const unsubscribe = onSnapshot(
      billRef,
      (snapshot) => {
        if (snapshot.exists()) {
          setSession({ id: snapshot.id, ...snapshot.data() } as Bill);
          setError(null);
        } else {
          setSession(null);
          setError('Session not found');
        }
        setIsLoading(false);
      },
      (err) => {
        console.error('Error listening to session:', err);
        setError(err.message);
        setIsLoading(false);
        toast({
          title: 'Connection Error',
          description: 'Could not connect to collaborative session.',
          variant: 'destructive',
        });
      }
    );

    return () => unsubscribe();
  }, [billId, toast]);

  /**
   * Updates the bill
   * @param updates - Partial bill data to update
   */
  const updateSession = useCallback(
    async (updates: Partial<Bill>) => {
      if (!billId) return;

      try {
        await billService.updateBill(billId, updates);
      } catch (error) {
        console.error('Error updating session:', error);
        toast({
          title: 'Update Failed',
          description: 'Could not update session.',
          variant: 'destructive',
        });
      }
    },
    [billId, toast]
  );

  /**
   * Adds the current user as a member of the session
   * @param anonymousName - Optional name for anonymous users
   */
  const joinSession = useCallback(
    async (anonymousName?: string) => {
      if (!billId) return;

      try {
        const userId = user?.uid || 'anonymous';
        const userName = user?.displayName || anonymousName || 'Anonymous';
        const email = user?.email || undefined;

        await billService.joinBill(billId, userId, userName, email);

        toast({
          title: 'Joined Session',
          description: 'You joined the collaborative bill session.',
        });
      } catch (error) {
        console.error('Error joining session:', error);
        toast({
          title: 'Join Failed',
          description: 'Could not join session.',
          variant: 'destructive',
        });
      }
    },
    [billId, user, toast]
  );

  /**
   * Ends the collaborative session (Archives it)
   */
  const endSession = useCallback(async () => {
    if (!billId) return;

    try {
      await billService.updateBill(billId, {
        status: 'archived'
      });

      toast({
        title: 'Session Ended',
        description: 'The collaborative session has been ended.',
      });
    } catch (error) {
      console.error('Error ending session:', error);
      toast({
        title: 'Error',
        description: 'Could not end session.',
        variant: 'destructive',
      });
    }
  }, [billId, toast]);

  return {
    session,
    isLoading,
    error,
    updateSession,
    joinSession,
    endSession,
  };
}
