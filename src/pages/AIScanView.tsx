import { useState, useEffect, useRef } from "react";
import {
  useLocation,
  useNavigate,
  useParams,
} from "react-router-dom";
import { HeroSection } from "@/components/layout/HeroSection";
import {
  BillWizard,
  BILL_WIZARD_REVIEW_STEP,
} from "@/components/bill-wizard/BillWizard";
import { DRAFT_CREATED_NAV_STATE } from "@/components/bill-wizard/hooks/useBillSession";
import { ShareLinkDialog } from "@/components/share/ShareLinkDialog";
import { BillLoadErrorState } from "@/components/bill/BillLoadErrorState";
import { Loader2 } from "lucide-react";
import { useBillContext } from "@/contexts/BillSessionContext";
import { useSessionTimeout } from "@/hooks/useSessionTimeout";
import { useReturnTo } from "@/hooks/useReturnTo";
import { useBillRouteInstanceKey } from "@/hooks/useBillRouteInstanceKey";
import { useIsMounted } from "@/hooks/useIsMounted";
import { useAuth } from "@/contexts/AuthContext";
import { useUserProfile } from "@/hooks/useUserProfile";
import {
  ensureUserInPeople,
  generateUserId,
  initialWizardStep,
} from "@/utils/billCalculations";
import { billService } from "@/services/billService";
import { userService } from "@/services/userService";
import { Person, BillData, ItemAssignment, Bill } from "@/types";
import type { BillLoadFailure } from "@/utils/billLoadResult";
import { deleteField, doc, getDoc } from "firebase/firestore";
import { db } from "@/config/firebase";

/** Fresh page + BillWizard per bill — see useBillRouteInstanceKey. */
export default function AIScanView() {
  return <AIScanViewContent key={useBillRouteInstanceKey()} />;
}

/**
 * AIScanViewContent - Simplified Bill Creation Page
 * Now uses the BillWizard component for step management
 */
function AIScanViewContent() {
  const location = useLocation();
  const navigate = useNavigate();
  const isMounted = useIsMounted();
  const { billId: routeBillId } = useParams<{ billId: string }>();
  const billId = routeBillId === "new" ? undefined : routeBillId;
  const { user } = useAuth();
  const { profile } = useUserProfile();

  // Centralized session management
  const {
    activeSession,
    savedSessions,
    isLoadingSessions,
    isUploading,
    uploadReceiptImage,
    resumeSession,
    loadBill,
    saveSession,
    removeReceiptImage,
    deleteSession,
  } = useBillContext();

  // Local state for wizard initialization
  const [billData, setBillData] = useState<BillData | null>(null);
  const [people, setPeople] = useState<Person[]>([]);
  const [itemAssignments, setItemAssignments] = useState<ItemAssignment>({});
  const [splitEvenly, setSplitEvenly] = useState<boolean>(false);
  const [title, setTitle] = useState<string>("");
  const [currentStep, setCurrentStep] = useState(0);
  const [eventId, setEventId] = useState<string | null>(null);
  const [isSessionLoaded, setIsSessionLoaded] = useState(
    !routeBillId || routeBillId === "new",
  );
  // URL load failure — shown only while nothing is rendered (!isSessionLoaded):
  // offline, getDoc rejects while the snapshot may still serve the bill.
  const [loadFailure, setLoadFailure] = useState<BillLoadFailure | null>(null);
  const [isRetrying, setIsRetrying] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [fetchedBill, setFetchedBill] = useState<Bill | null>(null);

  // The session for THIS page's bill. activeSession is only the user's latest
  // bill; an older one comes from the live list, else the one-off fetch.
  // Passing another bill to the wizard makes useBillSession drop every save.
  // Drafts (/bill/new) get null so the last viewed bill can't bleed in.
  const liveSession = !billId
    ? null
    : activeSession?.id === billId
      ? activeSession
      : (savedSessions.find((b) => b.id === billId) ?? null);
  const billSession = liveSession ?? (billId ? fetchedBill : null);

  // Share link state
  const [showShareLinkDialog, setShowShareLinkDialog] = useState(false);
  const [isGeneratingShareCode, setIsGeneratingShareCode] = useState(false);

  // Initialize data from session - track which session we've loaded to prevent auto-save loops
  const loadedSessionId = useRef<string | null>(null);

  // Helper: fetch all event members and return them as Person[]
  const fetchEventMembers = async (eventId: string): Promise<Person[]> => {
    try {
      const eventSnap = await getDoc(doc(db, "events", eventId));
      if (!eventSnap.exists()) return [];
      const memberIds: string[] = eventSnap.data().memberIds || [];
      const profiles = await Promise.all(
        memberIds.map((uid) =>
          userService.getUserProfile(uid).catch(() => null),
        ),
      );
      return profiles
        .filter((p): p is NonNullable<typeof p> => p !== null)
        .map((p) => ({
          id: generateUserId(p.uid),
          name: p.displayName,
          venmoId: p.venmoId,
        }));
    } catch (err) {
      console.error("Failed to fetch event members:", err);
      return [];
    }
  };

  useEffect(() => {
    // 1. If billId is undefined (route is /bill/new), this is a CLIENT-SIDE DRAFT.
    // We completely ignore activeSession to prevent the listener from forcing an existing
    // bill into the UI. We stay in local memory until JIT creation swaps the URL.
    if (!billId) {
      if (loadedSessionId.current !== "draft") {
        setBillData(null);
        setItemAssignments({});
        setSplitEvenly(false);
        setTitle("");
        setCurrentStep(0);
        // Note: no need to call removeReceiptImage() here — local state is already
        // cleared above, and there is no Firestore bill to update for a fresh draft.
        loadedSessionId.current = "draft";

        // Pre-populate people with all event members if coming from an event
        const { targetEventId } = location.state || {};
        if (targetEventId) {
          setEventId(targetEventId);
          fetchEventMembers(targetEventId).then((eventPeople) => {
            setPeople(ensureUserInPeople(eventPeople, user, profile));
          });
        } else {
          setEventId(null);
          setPeople(ensureUserInPeople([], user, profile));
        }
      }
      return; // Exit early, ignore activeSession
    }

    // 2. The live listener has this bill — as activeSession (latest) or as an
    // older savedSessions entry. Not the one-off fetch: it never updates.
    if (liveSession) {
      // Always sync real-time fields (assignments, people)
      setItemAssignments(liveSession.itemAssignments || {});
      setPeople(ensureUserInPeople(liveSession.people || [], user, profile));

      // Only update static/editor fields if this is the initial load for this session
      if (loadedSessionId.current !== liveSession.id) {
        setBillData(liveSession.billData || null);
        setSplitEvenly(liveSession.splitEvenly || false);
        setTitle(liveSession.title || "");
        setCurrentStep(
          initialWizardStep(liveSession, BILL_WIZARD_REVIEW_STEP),
        );
        setEventId(liveSession.eventId || null);
        loadedSessionId.current = liveSession.id;
        setIsSessionLoaded(true);
      }
    }
  }, [liveSession, billId, user, profile]);

  // Load bill when billId URL parameter changes, or Retry bumps loadAttempt
  const hasLoadedBillId = useRef<string | null>(null);

  useEffect(() => {
    const attemptKey = billId ? `${billId}#${loadAttempt}` : null;
    // Only load if billId/attempt changed and we haven't already loaded it
    if (billId && attemptKey !== hasLoadedBillId.current) {
      hasLoadedBillId.current = attemptKey;
      loadBill(billId).then((result) => {
        if (!isMounted.current) return;
        setIsRetrying(false);
        if (result.status !== "loaded") {
          setLoadFailure(result.status);
          return;
        }
        const fetchedBill = result.bill;
        setFetchedBill(fetchedBill);
        setLoadFailure(null);
        setBillData(fetchedBill.billData || null);
        setItemAssignments(fetchedBill.itemAssignments || {});
        setPeople(ensureUserInPeople(fetchedBill.people || [], user, profile));
        setSplitEvenly(fetchedBill.splitEvenly || false);
        setTitle(fetchedBill.title || "");
        setCurrentStep(initialWizardStep(fetchedBill, BILL_WIZARD_REVIEW_STEP));
        setEventId(fetchedBill.eventId || null);
        loadedSessionId.current = fetchedBill.id;
        setIsSessionLoaded(true);
      });
    }
  }, [billId, loadAttempt, loadBill, isMounted, user, profile]);

  // Resume session from navigation state (runs once on mount)
  const hasProcessedNavState = useRef(false);

  useEffect(() => {
    if (hasProcessedNavState.current) return;

    const { resumeSessionId } = location.state || {};
    if (resumeSessionId) {
      hasProcessedNavState.current = true;
      resumeSession(resumeSessionId);
      navigate(".", { replace: true, state: {} });
    }
    // Only run once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Session timeout
  // On session timeout, return the user where they came from rather than
  // always dumping them on the dashboard.
  const { goBack, label: backLabel } = useReturnTo({ eventId });

  useSessionTimeout({
    onTimeout: () => goBack(),
    timeoutMinutes: 20,
  });

  // A bill known only from the fetch has no listener, so after a share-code
  // write re-read it or the dialog never sees the code.
  const refreshFetchedShareCode = async (id: string) => {
    if (liveSession) return;
    const fresh = await billService.getBill(id);
    if (!fresh || !isMounted.current) return;
    setFetchedBill((prev) =>
      prev && prev.id === id
        ? {
            ...prev,
            shareCode: fresh.shareCode,
            shareCodeCreatedAt: fresh.shareCodeCreatedAt,
            shareCodeExpiresAt: fresh.shareCodeExpiresAt,
            shareCodeCreatedBy: fresh.shareCodeCreatedBy,
          }
        : prev,
    );
  };

  // Remove THIS page's receipt. A draft has no bill to clear; falling back to
  // activeSession would delete the latest bill's receipt.
  const handleRemoveReceiptImage = async () => {
    if (!billSession) return;
    await removeReceiptImage(billSession);
  };

  // Share link handlers
  const handleGenerateShareLink = async () => {
    if (!billSession?.id || !user) return;

    setIsGeneratingShareCode(true);
    try {
      await billService.generateShareCode(billSession.id, user.uid);
      await refreshFetchedShareCode(billSession.id);
      setShowShareLinkDialog(true);
    } catch (error) {
      console.error("Error generating share code:", error);
    } finally {
      setIsGeneratingShareCode(false);
    }
  };

  const handleRegenerateShareLink = async () => {
    if (!billSession?.id || !user) return;

    setIsGeneratingShareCode(true);
    try {
      // Clear existing code
      await billService.updateBill(billSession.id, {
        shareCode: deleteField() as unknown as string,
        shareCodeCreatedAt:
          deleteField() as unknown as import("firebase/firestore").Timestamp,
        shareCodeExpiresAt:
          deleteField() as unknown as import("firebase/firestore").Timestamp,
        shareCodeCreatedBy: deleteField() as unknown as string,
      });
      // Generate new code
      await billService.generateShareCode(billSession.id, user.uid);
      await refreshFetchedShareCode(billSession.id);
    } catch (error) {
      console.error("Error regenerating share code:", error);
    } finally {
      setIsGeneratingShareCode(false);
    }
  };

  const formatDate = (timestamp: { toDate: () => Date } | null | undefined) => {
    if (!timestamp)
      return new Date().toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
    const date = timestamp.toDate();
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  if (loadFailure && !isSessionLoaded) {
    return (
      <BillLoadErrorState
        failure={loadFailure}
        isRetrying={isRetrying}
        onRetry={() => {
          setIsRetrying(true);
          setLoadAttempt((n) => n + 1);
        }}
        onBack={() => goBack()}
        backLabel={backLabel}
      />
    );
  }

  // Single loading gate: wait for sessions to load AND bill data to be ready
  // Uses state (not ref) so it's batched with currentStep in the same render
  if (isLoadingSessions || !isSessionLoaded) {
    return (
      <div className="loading-container" style={{ minHeight: "60vh" }}>
        <Loader2 className="loading-spinner" />
      </div>
    );
  }

  const effectiveSession = billSession;

  const handleEventChange = async (newEventId: string | null) => {
    setEventId(newEventId);

    // If an event is selected, fetch members and override current people
    if (newEventId) {
      const eventMembers = await fetchEventMembers(newEventId);
      const newPeople = ensureUserInPeople(eventMembers, user, profile);
      setPeople(newPeople);

      // Clear assignments as people have changed
      setItemAssignments({});

      // Persist the change
      // Converting a private bill to an event bill REPLACES people with the
      // event members, which legitimately drops private-bill guests.
      const newBillId = await saveSession(
        {
          eventId: newEventId,
          billType: "event",
          people: newPeople,
          itemAssignments: {},
        },
        billId || activeSession?.id,
        { allowPeopleRemoval: true },
      );

      if (!billId && newBillId && isMounted.current) {
        navigate(`/bill/${newBillId}`, {
          replace: true,
          state: DRAFT_CREATED_NAV_STATE,
        });
      }
    } else {
      // If none is selected, convert back to private
      const newBillId = await saveSession(
        {
          eventId: deleteField() as unknown as string,
          billType: "private",
        },
        billId || activeSession?.id,
      );

      if (!billId && newBillId && isMounted.current) {
        navigate(`/bill/${newBillId}`, {
          replace: true,
          state: DRAFT_CREATED_NAV_STATE,
        });
      }
    }
  };

  // Enhance saveSession for JIT event creation and state injection
  const handleSaveSession = async (
    sessionData: Partial<Bill>,
    id?: string,
    options?: { allowPeopleRemoval?: boolean },
  ) => {
    // Inject the event metadata if it's set in state
    if (eventId && !sessionData.eventId) {
      sessionData.eventId = eventId;
      sessionData.billType = "event";
    }

    // Forward `options` or the people guard would silently lose intent here.
    return saveSession(sessionData, id, options);
  };

  return (
    <div className="h-full flex flex-col">
      <div className="shrink-0">
        <HeroSection
          hasBillData={!!billData}
          onShare={handleGenerateShareLink}
          title={title}
          onTitleChange={setTitle}
          titlePlaceholder={formatDate(effectiveSession?.createdAt)}
        />
      </div>

      <div className="flex-1 min-h-0 w-full">
        <BillWizard
          activeSession={effectiveSession}
          billId={billId}
          isUploading={isUploading}
          uploadReceiptImage={uploadReceiptImage}
          saveSession={handleSaveSession}
          removeReceiptImage={handleRemoveReceiptImage}
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
          eventId={eventId}
          onEventChange={handleEventChange}
        />
      </div>

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
    </div>
  );
}
