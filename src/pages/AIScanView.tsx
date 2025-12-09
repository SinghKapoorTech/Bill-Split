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
import { ensureUserInPeople } from '@/utils/billCalculations';
import { billService } from '@/services/billService';
import { Person, BillData, ItemAssignment } from '@/types';
import { deleteField } from 'firebase/firestore';

/**
 * AIScanView - Simplified Bill Creation Page
 * Now uses the BillWizard component for step management
 * Reduced from 1046 lines to ~170 lines
 */
export default function AIScanView() {
  const location = useLocation();
  const navigate = useNavigate();
  const { billId } = useParams<{ billId: string }>();
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

  useEffect(() => {
    // Load session data only if:
    // 1. We have a session AND
    // 2. We haven't loaded this specific session yet (prevents auto-save loop)
    if (activeSession && (!billId || activeSession.id === billId)) {
      // Only update if this is a different session than what we've loaded
      if (loadedSessionId.current !== activeSession.id) {
        console.log('✅ Loading session:', activeSession.id, 'billData:', activeSession.billData, 'people:', activeSession.people?.length);
        setBillData(activeSession.billData || null);
        setItemAssignments(activeSession.itemAssignments || {});
        setPeople(ensureUserInPeople(activeSession.people || [], user, profile));
        setSplitEvenly(activeSession.splitEvenly || false);
        setTitle(activeSession.title || '');
        setCurrentStep(activeSession.currentStep || 0);
        loadedSessionId.current = activeSession.id;
      }
    } else if (!activeSession && !billId && loadedSessionId.current === null) {
      // Fresh start - only initialize once
      console.log('Fresh start - initializing empty state');
      setBillData(null);
      setItemAssignments({});
      setPeople(ensureUserInPeople([], user, profile));
      setSplitEvenly(false);
      setCurrentStep(0);
      loadedSessionId.current = 'empty';
    }
    // Including activeSession but with session ID check to prevent loop
  }, [activeSession, billId, user, profile]);

  // Load bill when billId URL parameter changes
  const hasLoadedBillId = useRef<string | null>(null);

  useEffect(() => {
    // Only load if billId changed and we haven't already loaded it
    if (billId && billId !== hasLoadedBillId.current) {
      console.log('Loading bill from URL param:', billId);
      hasLoadedBillId.current = billId;
      // Pass silentLoad=true to prevent toast when loading from URL
      resumeSession(billId, true).then((fetchedBill) => {
        console.log('✅ Fetched bill:', billId, 'billData:', fetchedBill?.billData, 'people:', fetchedBill?.people?.length);
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
    // Intentionally NOT including activeSession?.id to avoid loop
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  return (
    <>
      <HeroSection
        hasBillData={!!billData}
        onShare={handleGenerateShareLink}
        title={title}
        onTitleChange={setTitle}
        titlePlaceholder={formatDate(activeSession?.createdAt)}
      />

      <BillWizard
        activeSession={activeSession}
        billId={billId}
        isUploading={isUploading}
        uploadReceiptImage={uploadReceiptImage}
        saveSession={saveSession}
        removeReceiptImage={removeReceiptImage}
        initialBillData={billData}
        initialPeople={people}
        initialItemAssignments={itemAssignments}
        initialSplitEvenly={splitEvenly}
        initialTitle={title}
        initialStep={currentStep}
        title={title}
        onTitleChange={setTitle}
      />

      {/* Share Link Dialog */}
      {activeSession && (
        <ShareLinkDialog
          billId={activeSession.id}
          shareCode={activeSession.shareCode}
          shareCodeExpiresAt={activeSession.shareCodeExpiresAt}
          onRegenerate={handleRegenerateShareLink}
          isRegenerating={isGeneratingShareCode}
          open={showShareLinkDialog}
          onOpenChange={setShowShareLinkDialog}
        />
      )}
    </>
  );
}