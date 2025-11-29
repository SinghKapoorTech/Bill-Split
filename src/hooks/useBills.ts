import { useCallback, useEffect, useState, useRef } from 'react';
import {
  collection,
  query,
  where,
  onSnapshot,
  doc,
  deleteDoc,
  Timestamp,
  orderBy,
  limit,
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { db, storage } from '@/config/firebase';
import { useAuth } from '@/contexts/AuthContext';
import { Bill, BillData } from '@/types/bill.types';
import { useToast } from './use-toast';
import { billService } from '@/services/billService';
import { removeUndefinedFields } from '@/utils/firestoreHelpers';

/**
 * Hook for managing user's private bills in the unified bills collection.
 * Provides the same interface as useBillSessionManager but uses the bills collection.
 */
export function useBills() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [activeSession, setActiveSession] = useState<Bill | null>(null);
  const [savedSessions, setSavedSessions] = useState<Bill[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isResuming, setIsResuming] = useState(false);

  const getStorageRef = useCallback((fileName: string) => {
    if (!user) return null;
    return ref(storage, `receipts/${user.uid}/${fileName}`);
  }, [user]);

  // Real-time listener for active session
  useEffect(() => {
    if (!user) {
      setIsLoading(false);
      setActiveSession(null);
      setSavedSessions([]);
      return;
    }

    setIsLoading(true);
    const billsRef = collection(db, 'bills');
    
    // Query for all private bills, ordered by updatedAt
    const q = query(
      billsRef,
      where('ownerId', '==', user.uid),
      where('billType', '==', 'private'),
      orderBy('updatedAt', 'desc')
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const bills = snapshot.docs.map(doc => ({ 
          id: doc.id, 
          ...doc.data() 
        } as Bill));
        
        if (bills.length > 0) {
          setActiveSession(bills[0]);
          setSavedSessions(bills.slice(1));
        } else {
          setActiveSession(null);
          setSavedSessions([]);
        }
        setIsLoading(false);
      },
      (error) => {
        console.error('Error loading sessions:', error);
        toast({ 
          title: 'Error', 
          description: 'Could not load your sessions.', 
          variant: 'destructive' 
        });
        setIsLoading(false);
      }
    );

    return () => unsubscribe();
  }, [user, toast]);

  const saveSession = useCallback(async (sessionData: Partial<Bill>, billId?: string) => {
    if (!user) return;

    try {
      // Clean all data to remove undefined values (Firestore doesn't accept them)
      const cleanedData = removeUndefinedFields(sessionData);

      if (billId) {
        // Update existing bill with cleaned data
        await billService.updateBill(billId, cleanedData as Partial<Bill>);
      } else {
        // Create new bill
        const defaultBillData: BillData = {
          items: [],
          subtotal: 0,
          tax: 0,
          tip: 0,
          total: 0
        };

        const billDataToUse = cleanedData.billData || defaultBillData;
        const peopleToUse = cleanedData.people || [];

        const newBillId = await billService.createBill(
          user.uid,
          user.displayName || 'Anonymous',
          'private',
          billDataToUse,
          peopleToUse
        );

        // Update with additional fields if provided
        const additionalUpdates: Partial<Bill> = {};
        if (cleanedData.itemAssignments !== undefined) additionalUpdates.itemAssignments = cleanedData.itemAssignments;
        if (cleanedData.splitEvenly !== undefined) additionalUpdates.splitEvenly = cleanedData.splitEvenly;
        if (cleanedData.receiptImageUrl !== undefined) additionalUpdates.receiptImageUrl = cleanedData.receiptImageUrl;
        if (cleanedData.receiptFileName !== undefined) additionalUpdates.receiptFileName = cleanedData.receiptFileName;
        if (cleanedData.currentStep !== undefined) additionalUpdates.currentStep = cleanedData.currentStep;
        if (cleanedData.title !== undefined) additionalUpdates.title = cleanedData.title;
        
        if (Object.keys(additionalUpdates).length > 0) {
          await billService.updateBill(newBillId, additionalUpdates);
        }
      }
    } catch (error) {
      console.error('Error saving session:', error);
      toast({ 
        title: 'Error', 
        description: 'Could not save session.', 
        variant: 'destructive' 
      });
    }
  }, [user, toast]);

  const uploadReceiptImage = async (file: File) => {
    if (!user) return null;

    const fileName = `receipt_${Date.now()}`;
    const storageRef = getStorageRef(fileName);
    if (!storageRef) return null;

    setIsUploading(true);

    try {
      const snapshot = await uploadBytes(storageRef, file);
      const downloadURL = await getDownloadURL(snapshot.ref);

      // Delete old image if exists
      if (activeSession?.receiptFileName) {
        const oldStorageRef = getStorageRef(activeSession.receiptFileName);
        if (oldStorageRef) {
          deleteObject(oldStorageRef).catch(err => {
            if (err.code !== 'storage/object-not-found') {
              console.error('Failed to delete old image', err);
            }
          });
        }
      }

      return { downloadURL, fileName };
    } catch (error) {
      console.error('Error uploading image:', error);
      toast({ 
        title: 'Upload Failed', 
        description: 'Could not upload receipt.', 
        variant: 'destructive' 
      });
      return null;
    } finally {
      setIsUploading(false);
    }
  };

  const removeReceiptImage = useCallback(async () => {
    if (!activeSession) return;

    try {
      // Delete the image from Firebase Storage if it exists
      if (activeSession.receiptFileName) {
        const storageRef = getStorageRef(activeSession.receiptFileName);
        if (storageRef) {
          try {
            await deleteObject(storageRef);
          } catch (error: any) {
            if (error.code !== 'storage/object-not-found') {
              console.error('Error deleting receipt image:', error);
            }
          }
        }
      }

      // Update the bill to remove image references
      await billService.updateBill(activeSession.id, {
        receiptImageUrl: undefined,
        receiptFileName: undefined,
      });
    } catch (error) {
      console.error('Error removing receipt image:', error);
      toast({ 
        title: 'Error', 
        description: 'Could not remove receipt image.', 
        variant: 'destructive' 
      });
    }
  }, [activeSession, getStorageRef, toast]);

  const archiveAndStartNewSession = useCallback(async () => {
    // Just clear the active session locally if needed, or let the UI handle it.
    // Since we auto-save, we don't need to do anything special to "archive".
    // The UI will call saveSession without an ID to create a new one.
    setActiveSession(null);
  }, []);

  const clearSession = useCallback(async () => {
    if (!activeSession?.id) {
      return;
    }

    try {
      // Delete the active bill from Firestore
      const billRef = doc(db, 'bills', activeSession.id);
      await deleteDoc(billRef);

      // Delete receipt image if it exists
      if (activeSession.receiptFileName) {
        const storageRef = getStorageRef(activeSession.receiptFileName);
        if (storageRef) {
          try {
            await deleteObject(storageRef);
          } catch (error: any) {
            if (error.code !== 'storage/object-not-found') {
              console.error('Error deleting receipt image:', error);
            }
          }
        }
      }
    } catch (error) {
      console.error('Error clearing session:', error);
      toast({ 
        title: 'Error', 
        description: 'Could not clear session.', 
        variant: 'destructive' 
      });
    }
  }, [activeSession, getStorageRef, toast]);

  const deleteSession = useCallback(async (sessionId: string, receiptFileName?: string) => {
    setIsDeleting(true);
    try {
      const billRef = doc(db, 'bills', sessionId);
      await deleteDoc(billRef);

      if (receiptFileName) {
        const storageRef = getStorageRef(receiptFileName);
        if (storageRef) {
          try {
            await deleteObject(storageRef);
          } catch (error: any) {
            if (error.code !== 'storage/object-not-found') {
              console.error('Error deleting receipt image:', error);
            }
          }
        }
      }

      toast({ title: 'Success', description: 'Session deleted.' });
    } catch (error) {
      console.error('Error deleting session:', error);
      toast({ 
        title: 'Error', 
        description: 'Could not delete session.', 
        variant: 'destructive' 
      });
    } finally {
      setIsDeleting(false);
    }
  }, [getStorageRef, toast]);

  const resumeSession = useCallback(async (sessionId: string) => {
    setIsResuming(true);
    try {
      // Touch the bill to update its updatedAt timestamp, moving it to the top
      await billService.updateBill(sessionId, { 
        updatedAt: Timestamp.now()
      });

      toast({ title: 'Success', description: 'Session resumed.' });
    } catch (error) {
      console.error('Error resuming session:', error);
      toast({ 
        title: 'Error', 
        description: 'Could not resume session.', 
        variant: 'destructive' 
      });
    } finally {
      setIsResuming(false);
    }
  }, [toast]);

  return {
    activeSession,
    savedSessions,
    isLoadingSessions: isLoading,
    isUploading,
    isDeleting,
    isResuming,
    saveSession,
    archiveAndStartNewSession,
    clearSession,
    deleteSession,
    resumeSession,
    uploadReceiptImage,
    removeReceiptImage,
  };
}
