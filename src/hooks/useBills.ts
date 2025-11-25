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
    
    // Query for active private bill
    const activeQuery = query(
      billsRef,
      where('ownerId', '==', user.uid),
      where('billType', '==', 'private'),
      where('status', '==', 'active'),
      limit(1)
    );

    const unsubscribeActive = onSnapshot(
      activeQuery,
      (snapshot) => {
        if (!snapshot.empty) {
          const billDoc = snapshot.docs[0];
          setActiveSession({ id: billDoc.id, ...billDoc.data() } as Bill);
        } else {
          setActiveSession(null);
        }
        setIsLoading(false);
      },
      (error) => {
        console.error('Error loading active session:', error);
        toast({ 
          title: 'Error', 
          description: 'Could not load your session.', 
          variant: 'destructive' 
        });
        setIsLoading(false);
      }
    );

    // Query for saved private bills
    const savedQuery = query(
      billsRef,
      where('ownerId', '==', user.uid),
      where('billType', '==', 'private'),
      where('status', '==', 'saved'),
      orderBy('savedAt', 'desc')
    );

    const unsubscribeSaved = onSnapshot(
      savedQuery,
      (snapshot) => {
        const saved = snapshot.docs.map(doc => ({ 
          id: doc.id, 
          ...doc.data() 
        } as Bill));
        setSavedSessions(saved);
      },
      (error) => {
        console.error('Error loading saved sessions:', error);
        toast({ 
          title: 'Error', 
          description: 'Could not load saved sessions.', 
          variant: 'destructive' 
        });
      }
    );

    return () => {
      unsubscribeActive();
      unsubscribeSaved();
    };
  }, [user, toast]);

  const saveSession = useCallback(async (sessionData: Partial<Bill>) => {
    if (!user) return;

    try {
      if (activeSession?.id) {
        // Update existing bill - filter out undefined fields
        const updates: Record<string, any> = {};
        Object.keys(sessionData).forEach((key) => {
          const value = sessionData[key as keyof Bill];
          if (value !== undefined) {
            updates[key] = value;
          }
        });
        
        await billService.updateBill(activeSession.id, updates as Partial<Bill>);
      } else {
        // Create new bill
        const defaultBillData: BillData = {
          items: [],
          subtotal: 0,
          tax: 0,
          tip: 0,
          total: 0
        };

        const billId = await billService.createBill(
          user.uid,
          user.displayName || 'Anonymous',
          'private',
          sessionData.billData || defaultBillData,
          sessionData.people || []
        );

        // Update with additional fields if provided - filter undefined
        const additionalUpdates: Partial<Bill> = {};
        if (sessionData.itemAssignments !== undefined) additionalUpdates.itemAssignments = sessionData.itemAssignments;
        if (sessionData.customTip !== undefined) additionalUpdates.customTip = sessionData.customTip;
        if (sessionData.customTax !== undefined) additionalUpdates.customTax = sessionData.customTax;
        if (sessionData.assignmentMode !== undefined) additionalUpdates.assignmentMode = sessionData.assignmentMode;
        if (sessionData.splitEvenly !== undefined) additionalUpdates.splitEvenly = sessionData.splitEvenly;
        if (sessionData.receiptImageUrl !== undefined) additionalUpdates.receiptImageUrl = sessionData.receiptImageUrl;
        if (sessionData.receiptFileName !== undefined) additionalUpdates.receiptFileName = sessionData.receiptFileName;
        
        if (Object.keys(additionalUpdates).length > 0) {
          await billService.updateBill(billId, additionalUpdates);
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
  }, [activeSession, user, toast]);

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
    if (activeSession?.id) {
      try {
        await billService.updateBill(activeSession.id, { 
          status: 'saved', 
          savedAt: Timestamp.now() 
        });
      } catch (error) {
        console.error('Error archiving session:', error);
        toast({ 
          title: 'Error', 
          description: 'Could not archive session.', 
          variant: 'destructive' 
        });
      }
    }
  }, [activeSession, toast]);

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
      // Archive current active session if it exists
      if (activeSession?.id) {
        await billService.updateBill(activeSession.id, { 
          status: 'saved', 
          savedAt: Timestamp.now() 
        });
      }

      // Set the chosen session to active
      await billService.updateBill(sessionId, { 
        status: 'active', 
        savedAt: undefined 
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
  }, [activeSession, toast]);

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
