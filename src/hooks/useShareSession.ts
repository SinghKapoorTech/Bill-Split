import { useState, useCallback } from 'react';
import { Timestamp } from 'firebase/firestore';
import { useAuth } from '@/contexts/AuthContext';
import { Bill } from '@/types/bill.types';
import { useToast } from './use-toast';
import { billService } from '@/services/billService';

/**
 * Hook for creating and sharing collaborative sessions
 */
export function useShareSession() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [isCreating, setIsCreating] = useState(false);
  const [isSharing, setIsSharing] = useState(false);

  /**
   * Creates a new collaborative session from scratch
   * @returns The new session ID and share code
   */
  const createCollaborativeSession = useCallback(async (): Promise<{
    sessionId: string;
    shareCode: string;
  } | null> => {
    setIsCreating(true);
    try {
      const ownerId = user?.uid || 'anonymous';
      const ownerName = user?.displayName || 'Anonymous';
      
      // Create a new bill
      const billId = await billService.createBill(
        ownerId,
        ownerName,
        'private', // Start as private, share code makes it accessible
        {
          items: [],
          subtotal: 0,
          tax: 0,
          tip: 0,
          total: 0
        },
        [] // No people initially
      );

      // Generate share code
      const shareCode = await billService.generateShareCode(billId, ownerId);

      toast({
        title: 'Session Created',
        description: 'Your collaborative session is ready to share!',
      });

      return { sessionId: billId, shareCode };
    } catch (error) {
      console.error('Error creating collaborative session:', error);
      toast({
        title: 'Creation Failed',
        description: 'Could not create collaborative session.',
        variant: 'destructive',
      });
      return null;
    } finally {
      setIsCreating(false);
    }
  }, [user, toast]);

  /**
   * Converts a private session to a collaborative session
   * @param privateSession - The private session to share
   * @returns The new collaborative session ID and share code
   */
  const sharePrivateSession = useCallback(
    async (
      privateSession: Bill
    ): Promise<{ sessionId: string; shareCode: string } | null> => {
      setIsSharing(true);
      try {
        const ownerId = user?.uid || 'anonymous';
        const ownerName = user?.displayName || 'Anonymous';

        // Create a new bill with existing data
        const billId = await billService.createBill(
          ownerId,
          ownerName,
          'private',
          privateSession.billData || {
            items: [],
            subtotal: 0,
            tax: 0,
            tip: 0,
            total: 0
          },
          privateSession.people || []
        );

        // Update additional fields that createBill doesn't handle directly
        await billService.updateBill(billId, {
          itemAssignments: privateSession.itemAssignments || {},
          splitEvenly: privateSession.splitEvenly || false,
          receiptImageUrl: privateSession.receiptImageUrl || undefined,
          receiptFileName: privateSession.receiptFileName || undefined,
        });

        // Generate share code
        const shareCode = await billService.generateShareCode(billId, ownerId);

        toast({
          title: 'Session Shared',
          description: 'Your session is now collaborative!',
        });

        return { sessionId: billId, shareCode };
      } catch (error) {
        console.error('Error sharing session:', error);
        toast({
          title: 'Share Failed',
          description: 'Could not share session.',
          variant: 'destructive',
        });
        return null;
      } finally {
        setIsSharing(false);
      }
    },
    [user, toast]
  );

  return {
    isCreating,
    isSharing,
    createCollaborativeSession,
    sharePrivateSession,
  };
}
