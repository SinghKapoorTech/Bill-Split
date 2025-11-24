import { useCallback, useEffect, useState, useRef } from 'react';
import {
  collection,
  query,
  where,
  getDocs,
  doc,
  setDoc,
  deleteDoc,
  writeBatch,
  Timestamp,
  limit,
  orderBy,
  runTransaction,
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { db, storage } from '@/config/firebase';
import { useAuth } from '@/contexts/AuthContext';
import { Bill, BillData } from '@/types/bill.types';
import { useToast } from './use-toast';
import { removeUndefinedFields } from '@/utils/firestore';

/**
 * Manages the user's bill sessions, persisting them to Firestore and Firebase Storage.
 */
export function useBillSessionManager() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [activeSession, setActiveSession] = useState<Bill | null>(null);
  const [savedSessions, setSavedSessions] = useState<Bill[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isResuming, setIsResuming] = useState(false);
  const isCreatingSession = useRef(false);

  const getSessionsCollectionRef = useCallback(() => {
    if (!user) return null;
    return collection(db, `users/${user.uid}/sessions`);
  }, [user]);

  const getStorageRef = useCallback((fileName: string) => {
    if (!user) return null;
    return ref(storage, `receipts/${user.uid}/${fileName}`);
  }, [user]);

  const loadActiveSession = useCallback(async () => {
    const collRef = getSessionsCollectionRef();
    if (!collRef) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    try {
      const q = query(collRef, where('status', '==', 'active'), limit(1));
      const querySnapshot = await getDocs(q);
      if (!querySnapshot.empty) {
        const doc = querySnapshot.docs[0];
        setActiveSession({ ...doc.data(), id: doc.id } as Bill);
      } else {
        setActiveSession(null);
      }
    } catch (error) {
      console.error("Error loading active session:", error);
      toast({ title: "Error", description: "Could not load your session.", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  }, [getSessionsCollectionRef, toast]);

  const loadSavedSessions = useCallback(async () => {
    const collRef = getSessionsCollectionRef();
    if (!collRef) return;

    try {
      const q = query(collRef, where('status', '==', 'saved'), orderBy('savedAt', 'desc'));
      const querySnapshot = await getDocs(q);
      const saved = querySnapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as Bill));
      setSavedSessions(saved);
    } catch (error) {
      console.error("Error loading saved sessions:", error);
      toast({ title: "Error", description: "Could not load saved sessions.", variant: "destructive" });
    }
  }, [getSessionsCollectionRef, toast]);

  const saveSession = useCallback(async (sessionData: Partial<Bill>) => {
    const collRef = getSessionsCollectionRef();
    if (!collRef) return;

    const cleanedData = removeUndefinedFields(sessionData);

    try {
      let sessionToSave: Bill | null = null;
      if (activeSession?.id) {
        const docRef = doc(collRef, activeSession.id);
        await runTransaction(db, async (transaction) => {
          const sessionDoc = await transaction.get(docRef);
          if (!sessionDoc.exists()) {
            throw new Error("Session document does not exist!");
          }

          const currentData = sessionDoc.data() as Bill;

          if (currentData.receiptFileName && !cleanedData.receiptImageUrl && cleanedData.receiptImageUrl !== undefined) {
            const oldStorageRef = getStorageRef(currentData.receiptFileName);
            if (oldStorageRef) {
              deleteObject(oldStorageRef).catch((err: any) => {
                // Ignore "not found" errors - the image may have already been deleted
                if (err.code !== 'storage/object-not-found') {
                  console.error("Failed to delete orphaned image:", err);
                }
              });
            }
          }

          const updatedData = { ...currentData, ...cleanedData, updatedAt: Timestamp.now() };
          transaction.update(docRef, updatedData);
          sessionToSave = updatedData;
        });

      } else {
        if (isCreatingSession.current) {
          console.warn("Session creation already in progress, skipping.");
          return;
        }
        isCreatingSession.current = true;

        const newDocRef = doc(collRef);
        const defaultBillData: BillData = {
          items: [],
          subtotal: 0,
          tax: 0,
          tip: 0,
          total: 0
        };

        sessionToSave = {
          id: newDocRef.id,
          billType: 'private',
          ownerId: user?.uid || '',
          status: 'active',
          billData: defaultBillData,
          itemAssignments: {},
          people: [],
          customTip: '',
          customTax: '',
          assignmentMode: 'checkboxes',
          splitEvenly: false,
          members: [],
          createdAt: Timestamp.now(),
          updatedAt: Timestamp.now(),
          lastActivity: Timestamp.now(),
          ...cleanedData,
        } as Bill;
        await setDoc(newDocRef, sessionToSave);
      }

      if (sessionToSave) {
        setActiveSession(sessionToSave);
      }
    } catch (error) {
      console.error("Error saving session:", error);
    } finally {
      isCreatingSession.current = false;
    }
  }, [activeSession, getSessionsCollectionRef, getStorageRef]);

    const uploadReceiptImage = async (file: File) => {

      const fileName = `receipt_${Date.now()}`;

      const storageRef = getStorageRef(fileName);

      if (!storageRef) return null;



      setIsUploading(true);

      try {

        const snapshot = await uploadBytes(storageRef, file);

        const downloadURL = await getDownloadURL(snapshot.ref);



        if (activeSession?.receiptFileName) {

          const oldStorageRef = getStorageRef(activeSession.receiptFileName);

          if (oldStorageRef) deleteObject(oldStorageRef).catch(err => console.error("Failed to delete old image", err));

        }



        return { downloadURL, fileName };

      } catch (error) {

        console.error("Error uploading image:", error);

        toast({ title: "Upload Failed", description: "Could not upload receipt.", variant: "destructive" });

        return null;

      } finally {

        setIsUploading(false);

      }

    };

  const archiveAndStartNewSession = useCallback(async () => {
    if (activeSession?.id) {
      const collRef = getSessionsCollectionRef();
      if (!collRef) return;
      const docRef = doc(collRef, activeSession.id);
      await setDoc(docRef, { status: 'saved', savedAt: Timestamp.now() }, { merge: true });
    }
    setActiveSession(null);
    // The UI will now reflect a new, empty session
  }, [activeSession, getSessionsCollectionRef]);

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
              console.error("Error deleting receipt image:", error);
            }
          }
        }
      }

      // Update the session to remove image references
      await saveSession({
        receiptImageUrl: null,
        receiptFileName: null,
      });
    } catch (error) {
      console.error("Error removing receipt image:", error);
      toast({ title: "Error", description: "Could not remove receipt image.", variant: "destructive" });
    }
  }, [activeSession, getStorageRef, saveSession, toast]);

  const clearSession = useCallback(async () => {
    const collRef = getSessionsCollectionRef();
    if (!collRef || !activeSession?.id) {
      setActiveSession(null);
      return;
    }

    try {
      // Delete the active session from Firestore
      const docRef = doc(collRef, activeSession.id);
      await deleteDoc(docRef);

      // Delete receipt image if it exists
      if (activeSession.receiptFileName) {
        const storageRef = getStorageRef(activeSession.receiptFileName);
        if (storageRef) {
          try {
            await deleteObject(storageRef);
          } catch (error: any) {
            if (error.code !== 'storage/object-not-found') {
              console.error("Error deleting receipt image:", error);
            }
          }
        }
      }

      setActiveSession(null);
    } catch (error) {
      console.error("Error clearing session:", error);
      toast({ title: "Error", description: "Could not clear session.", variant: "destructive" });
    }
  }, [activeSession, getSessionsCollectionRef, getStorageRef, toast]);

  const deleteSession = useCallback(async (sessionId: string, receiptFileName?: string) => {
    const collRef = getSessionsCollectionRef();
    if (!collRef) return;

    setIsDeleting(true);
    try {
      const docRef = doc(collRef, sessionId);
      await deleteDoc(docRef);

      if (receiptFileName) {
        const storageRef = getStorageRef(receiptFileName);
        if (storageRef) {
          try {
            await deleteObject(storageRef);
          } catch (error: any) {
            if (error.code !== 'storage/object-not-found') {
              console.error("Error deleting receipt image:", error);
            }
          }
        }
      }

      setSavedSessions(prev => prev.filter(s => s.id !== sessionId));
      toast({ title: "Success", description: "Session deleted." });
    } catch (error) {
      console.error("Error deleting session:", error);
      toast({ title: "Error", description: "Could not delete session.", variant: "destructive" });
    } finally {
      setIsDeleting(false);
    }
  }, [getSessionsCollectionRef, getStorageRef, toast]);

  const resumeSession = useCallback(async (sessionId: string) => {
    const collRef = getSessionsCollectionRef();
    if (!collRef) return;

    const sessionToResume = savedSessions.find(s => s.id === sessionId);
    if (!sessionToResume) return;

    setIsResuming(true);
    const batch = writeBatch(db);

    const newSavedSessions = [...savedSessions.filter(s => s.id !== sessionId)];

    // Archive current active session if it exists
    if (activeSession?.id) {
      const currentActiveRef = doc(collRef, activeSession.id);
      const archivedSession = { ...activeSession, status: 'saved' as const, savedAt: Timestamp.now() };
      batch.update(currentActiveRef, { status: 'saved', savedAt: Timestamp.now() });
      newSavedSessions.push(archivedSession);
    }

    // Set the chosen session to active
    const newActiveRef = doc(collRef, sessionId);
    batch.update(newActiveRef, { status: 'active', savedAt: null });

    try {
      await batch.commit();
      // Optimistic UI update
      setActiveSession({ ...sessionToResume, status: 'active' });
      setSavedSessions(newSavedSessions.sort((a, b) => b.savedAt!.toMillis() - a.savedAt!.toMillis()));
      toast({ title: "Success", description: "Session resumed." });
    } catch (error) {
      console.error("Error resuming session:", error);
      toast({ title: "Error", description: "Could not resume session.", variant: "destructive" });
    } finally {
      setIsResuming(false);
    }
  }, [activeSession, savedSessions, getSessionsCollectionRef, toast]);

  useEffect(() => {
    if (user) {
      loadActiveSession();
    } else {
      setIsLoading(false);
      setActiveSession(null);
      setSavedSessions([]);
    }
  }, [user, loadActiveSession]);

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
    loadSavedSessions,
  };
}
