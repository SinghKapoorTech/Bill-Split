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
export function useBillSession(billId: string | null) {
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

  // Real-time listener for the parent event (if applicable)
  const [isEventMember, setIsEventMember] = useState(false);
  
  useEffect(() => {
    if (!session?.eventId || !user) {
      setIsEventMember(false);
      return;
    }

    const eventRef = doc(db, 'events', session.eventId);
    const unsubscribe = onSnapshot(
      eventRef,
      (snapshot) => {
        if (snapshot.exists()) {
          const eventData = snapshot.data();
          const members = eventData.memberIds || [];
          setIsEventMember(members.includes(user.uid));
        } else {
          setIsEventMember(false);
        }
      },
      (err) => {
        console.error('Error listening to parent event:', err);
        setIsEventMember(false);
      }
    );

    return () => unsubscribe();
  }, [session?.eventId, user]);

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
   * @param shareCode - Required for anonymous users to create a shadow user
   * @returns The userId that was used to join (useful for anonymous users)
   */
  const joinSession = useCallback(
    async (anonymousName?: string, shareCode?: string): Promise<string | undefined> => {
      if (!billId) return undefined;

      try {
        const userName = user?.displayName || anonymousName || 'Anonymous';
        let userId: string;

        if (shareCode) {
          // Joining via share code — use Cloud Function which has admin write access
          // Works for both authenticated and anonymous users
          userId = await billService.joinBillAsGuest(billId, shareCode, userName);
        } else if (user) {
          // Authenticated user joining without share code (e.g. event member)
          userId = user.uid;
          await billService.joinBill(billId, userId, userName, user.email || undefined);
        } else {
          throw new Error('Share code is required for guest access');
        }

        toast({
          title: 'Joined Session',
          description: 'You joined the collaborative bill session.',
        });
        
        return userId;
      } catch (error) {
        console.error('Error joining session:', error);
        toast({
          title: 'Join Failed',
          description: 'Could not join session.',
          variant: 'destructive',
        });
        throw error;
      }
    },
    [billId, user, toast]
  );

  /**
   * Ends the collaborative session (Archives it)
   */
  const endSession = useCallback(async () => {
    // Just clear local state or navigate away.
    // The session data remains in Firestore.
    setSession(null);
    toast({
      title: 'Session Ended',
      description: 'You have left the collaborative session.',
    });
  }, [toast]);

  return {
    session,
    isLoading,
    error,
    isEventMember,
    updateSession,
    joinSession,
    endSession,
    toggleAssignment: useCallback(async (itemId: string, personId: string, isAssigned: boolean) => {
      if (!billId) return;
      try {
        await billService.toggleItemAssignment(billId, itemId, personId, isAssigned);
      } catch (error) {
        console.error('Error toggling assignment:', error);
        toast({
          title: 'Update Failed',
          description: 'Could not update item assignment.',
          variant: 'destructive',
        });
      }
    }, [billId, toast])
  };
}
