import { useState, useEffect, useRef } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { HeroSection } from '@/components/layout/HeroSection';
import { BillWizard } from '@/components/bill-wizard/BillWizard';
import { ShareLinkDialog } from '@/components/share/ShareLinkDialog';
import { Loader2 } from 'lucide-react';
import { useBillContext } from '@/contexts/BillSessionContext';
import { useSessionTimeout } from '@/hooks/useSessionTimeout';
import { useAuth } from '@/contexts/AuthContext';
import { useUserProfile } from '@/hooks/useUserProfile';
import { ensureUserInPeople, generateUserId } from '@/utils/billCalculations';
import { billService } from '@/services/billService';
import { userService } from '@/services/userService';
import { Person, BillData, ItemAssignment, Bill } from '@/types';
import { deleteField, doc, getDoc } from 'firebase/firestore';
import { db } from '@/config/firebase';

/**
 * AIScanView - Simplified Bill Creation Page
 * Now uses the BillWizard component for step management
 * Reduced from 1046 lines to ~170 lines
 */
export default function AIScanView() {
  const location = useLocation();
  const navigate = useNavigate();
  const { billId: routeBillId } = useParams<{ billId: string }>();
  const billId = routeBillId === 'new' ? undefined : routeBillId;
  const { user } = useAuth();
  const { profile } = useUserProfile();

  // Centralized session management
  const {
    activeSession,
    isLoadingSessions,
    isUploading,
    uploadReceiptImage,
    resumeSession,
    saveSession,
    removeReceiptImage,
    deleteSession,
  } = useBillContext();

  // Local state for wizard initialization
  const [billData, setBillData] = useState<BillData | null>(null);
  const [people, setPeople] = useState<Person[]>([]);
  const [itemAssignments, setItemAssignments] = useState<ItemAssignment>({});
  const [splitEvenly, setSplitEvenly] = useState<boolean>(false);
  const [title, setTitle] = useState<string>('');
  const [currentStep, setCurrentStep] = useState(0);

  // Share link state
  const [showShareLinkDialog, setShowShareLinkDialog] = useState(false);
  const [isGeneratingShareCode, setIsGeneratingShareCode] = useState(false);

  // Initialize data from session - track which session we've loaded to prevent auto-save loops
  const loadedSessionId = useRef<string | null>(null);

  // Helper: fetch all event members and return them as Person[]
  const fetchEventMembers = async (eventId: string): Promise<Person[]> => {
    try {
      const eventSnap = await getDoc(doc(db, 'events', eventId));
      if (!eventSnap.exists()) return [];
      const memberIds: string[] = eventSnap.data().memberIds || [];
      const profiles = await Promise.all(
        memberIds.map(uid => userService.getUserProfile(uid).catch(() => null))
      );
      return profiles
        .filter((p): p is NonNullable<typeof p> => p !== null)
        .map(p => ({
          id: generateUserId(p.uid),
          name: p.displayName,
          venmoId: p.venmoId,
        }));
    } catch (err) {
      console.error('Failed to fetch event members:', err);
      return [];
    }
  };

  useEffect(() => {
    // 1. If billId is undefined (route is /bill/new), this is a CLIENT-SIDE DRAFT.
    // We completely ignore activeSession to prevent the listener from forcing an existing
    // bill into the UI. We stay in local memory until JIT creation swaps the URL.
    if (!billId) {
      if (loadedSessionId.current !== 'draft') {
        setBillData(null);
        setItemAssignments({});
        setSplitEvenly(false);
        setTitle('');
        setCurrentStep(0);
        removeReceiptImage(); // Clear any stale image from previous sessions
        loadedSessionId.current = 'draft';

        // Pre-populate people with all event members if coming from an event
        const { targetEventId } = location.state || {};
        if (targetEventId) {
          fetchEventMembers(targetEventId).then(eventPeople => {
            setPeople(ensureUserInPeople(eventPeople, user, profile));
          });
        } else {
          setPeople(ensureUserInPeople([], user, profile));
        }
      }
      return; // Exit early, ignore activeSession
    }

    // 2. We have a target billId AND an activeSession that matches it
    if (activeSession && activeSession.id === billId) {
      // Always sync real-time fields (assignments, people)
      setItemAssignments(activeSession.itemAssignments || {});
      setPeople(ensureUserInPeople(activeSession.people || [], user, profile));

      // Only update static/editor fields if this is the initial load for this session
      if (loadedSessionId.current !== activeSession.id) {
        setBillData(activeSession.billData || null);
        setSplitEvenly(activeSession.splitEvenly || false);
        setTitle(activeSession.title || '');
        setCurrentStep(activeSession.currentStep || 0);
        loadedSessionId.current = activeSession.id;
      }
    }
  }, [activeSession, billId, user, profile]);

  // Load bill when billId URL parameter changes
  const hasLoadedBillId = useRef<string | null>(null);

  useEffect(() => {
    // Only load if billId changed and we haven't already loaded it
    if (billId && billId !== hasLoadedBillId.current) {
      hasLoadedBillId.current = billId;
      // Pass silentLoad=true to prevent toast when loading from URL
      resumeSession(billId, true).then((fetchedBill) => {
        if (fetchedBill) {
          setBillData(fetchedBill.billData || null);
          setItemAssignments(fetchedBill.itemAssignments || {});
          setPeople(ensureUserInPeople(fetchedBill.people || [], user, profile));
          setSplitEvenly(fetchedBill.splitEvenly || false);
          setTitle(fetchedBill.title || '');
          setCurrentStep(fetchedBill.currentStep || 0);
        }
      });
    }
  }, [billId, resumeSession, user, profile]);

  // Resume session from navigation state (runs once on mount)
  const hasProcessedNavState = useRef(false);

  useEffect(() => {
    if (hasProcessedNavState.current) return;

    const { resumeSessionId } = location.state || {};
    if (resumeSessionId) {
      hasProcessedNavState.current = true;
      resumeSession(resumeSessionId);
      navigate('.', { replace: true, state: {} });
    }
    // Only run once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Session timeout
  useSessionTimeout({
    onTimeout: () => navigate('/dashboard'),
    timeoutMinutes: 20,
  });

  // Share link handlers
  const handleGenerateShareLink = async () => {
    if (!activeSession?.id || !user) return;

    setIsGeneratingShareCode(true);
    try {
      await billService.generateShareCode(activeSession.id, user.uid);
      setShowShareLinkDialog(true);
    } catch (error) {
      console.error('Error generating share code:', error);
    } finally {
      setIsGeneratingShareCode(false);
    }
  };

  const handleRegenerateShareLink = async () => {
    if (!activeSession?.id || !user) return;

    setIsGeneratingShareCode(true);
    try {
      // Clear existing code
      await billService.updateBill(activeSession.id, {
        shareCode: deleteField() as any,
        shareCodeCreatedAt: deleteField() as any,
        shareCodeExpiresAt: deleteField() as any,
        shareCodeCreatedBy: deleteField() as any,
      });
      // Generate new code
      await billService.generateShareCode(activeSession.id, user.uid);
    } catch (error) {
      console.error('Error regenerating share code:', error);
    } finally {
      setIsGeneratingShareCode(false);
    }
  };

  const formatDate = (timestamp: any) => {
    if (!timestamp) return new Date().toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric'
    });
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric'
    });
  };

  if (isLoadingSessions) {
    return (
      <div className="loading-container">
        <Loader2 className="loading-spinner" />
      </div>
    );
  }

  // Wait for session data to load before rendering wizard
  // This prevents BillWizard from initializing with empty state
  const isDataReady = !billId || loadedSessionId.current !== null;

  if (!isDataReady) {
    return (
      <div className="loading-container">
        <Loader2 className="loading-spinner" />
      </div>
    );
  }

  // Prevent data bleed: ensure new drafts pass `null` to the wizard
  // instead of the real-time activeSession from useBills (which might be the last viewed bill)
  const isDraft = !billId;
  const effectiveSession = isDraft ? null : activeSession;

  // Enhance saveSession for JIT event creation
  const handleSaveSession = async (sessionData: Partial<Bill>, id?: string) => {
    const { targetEventId } = location.state || {};

    // If we're creating a draft AND we came from an event page, inject the event metadata
    if (isDraft && targetEventId && !sessionData.eventId) {
      sessionData.eventId = targetEventId;
      sessionData.billType = 'event';
    }

    return saveSession(sessionData, id);
  };

  return (
    <>
      <HeroSection
        hasBillData={!!billData}
        onShare={handleGenerateShareLink}
        title={title}
        onTitleChange={setTitle}
        titlePlaceholder={formatDate(effectiveSession?.createdAt)}
      />

      <BillWizard
        activeSession={effectiveSession}
        billId={billId}
        isUploading={isUploading}
        uploadReceiptImage={uploadReceiptImage}
        saveSession={handleSaveSession}
        removeReceiptImage={removeReceiptImage}
        deleteSession={deleteSession}
        initialBillData={billData}
        initialPeople={people}
        initialItemAssignments={itemAssignments}
        initialSplitEvenly={splitEvenly}
        initialTitle={title}
        initialStep={currentStep}
        title={title}
        onTitleChange={setTitle}
        hasBillData={!!billData}
        onShare={handleGenerateShareLink}
      />

      {/* Share Link Dialog */}
      {effectiveSession && (
        <ShareLinkDialog
          billId={effectiveSession.id}
          shareCode={effectiveSession.shareCode}
          shareCodeExpiresAt={effectiveSession.shareCodeExpiresAt}
          onRegenerate={handleRegenerateShareLink}
          isRegenerating={isGeneratingShareCode}
          open={showShareLinkDialog}
          onOpenChange={setShowShareLinkDialog}
        />
      )}
    </>
  );
}