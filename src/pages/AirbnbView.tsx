import { useState, useEffect, useRef } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { HeroSection } from '@/components/layout/HeroSection';
import { AirbnbWizard } from '@/components/airbnb-wizard/AirbnbWizard';
import { ShareLinkDialog } from '@/components/share/ShareLinkDialog';
import { BillLoadErrorState } from '@/components/bill/BillLoadErrorState';
import { Loader2 } from 'lucide-react';
import { useBillContext } from '@/contexts/BillSessionContext';
import { useSessionTimeout } from '@/hooks/useSessionTimeout';
import { useReturnTo } from '@/hooks/useReturnTo';
import { useBillRouteInstanceKey } from '@/hooks/useBillRouteInstanceKey';
import { useIsMounted } from '@/hooks/useIsMounted';
import { DRAFT_CREATED_NAV_STATE } from '@/components/bill-wizard/hooks/useBillSession';
import { useAuth } from '@/contexts/AuthContext';
import { useUserProfile } from '@/hooks/useUserProfile';
import { ensureUserInPeople, generateUserId } from '@/utils/billCalculations';
import { billService } from '@/services/billService';
import { userService } from '@/services/userService';
import { Person, BillData, ItemAssignment, Bill } from '@/types';
import { BillLoadFailure, classifyBillLoadError } from '@/utils/billLoadResult';
import { deleteField, doc, getDoc } from 'firebase/firestore';
import { db } from '@/config/firebase';

/** Fresh page + AirbnbWizard per bill — see useBillRouteInstanceKey. */
export default function AirbnbView() {
    return <AirbnbViewContent key={useBillRouteInstanceKey()} />;
}

function AirbnbViewContent() {
    const location = useLocation();
    const navigate = useNavigate();
    const isMounted = useIsMounted();
    const { billId: routeBillId } = useParams<{ billId: string }>();
    const billId = routeBillId === 'new' ? undefined : routeBillId;
    const { user } = useAuth();
    const { profile } = useUserProfile();

    const {
        activeSession,
        savedSessions,
        isLoadingSessions,
        resumeSession,
        loadBill,
        saveSession,
        deleteSession,
    } = useBillContext();

    const [billData, setBillData] = useState<BillData | null>(null);
    const [people, setPeople] = useState<Person[]>([]);
    const [itemAssignments, setItemAssignments] = useState<ItemAssignment>({});
    const [splitEvenly, setSplitEvenly] = useState<boolean>(true);
    const [title, setTitle] = useState<string>('');
    const [currentStep, setCurrentStep] = useState(0);
    const [eventId, setEventId] = useState<string | null>(null);
    const [airbnbData, setAirbnbData] = useState<Bill['airbnbData']>(undefined);

    const [showShareLinkDialog, setShowShareLinkDialog] = useState(false);
    const [isGeneratingShareCode, setIsGeneratingShareCode] = useState(false);

    const loadedSessionId = useRef<string | null>(null);
    // State, not a ref, so it re-renders: once this page has shown its bill
    // (fetch, snapshot or draft) a later failed fetch must never replace it.
    const [isBillRendered, setIsBillRendered] = useState(false);
    const [loadFailure, setLoadFailure] = useState<BillLoadFailure | null>(null);
    const [loadAttempt, setLoadAttempt] = useState(0);
    const [fetchedBill, setFetchedBill] = useState<Bill | null>(null);

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
        if (!billId) {
            if (loadedSessionId.current !== 'draft') {
                setBillData(null);
                setItemAssignments({});
                setSplitEvenly(false);
                setTitle('');
                setCurrentStep(0);
                setAirbnbData(undefined);
                loadedSessionId.current = 'draft';
                setIsBillRendered(true);

                const { targetEventId } = location.state || {};
                if (targetEventId) {
                    setEventId(targetEventId);
                    fetchEventMembers(targetEventId).then(eventPeople => {
                        setPeople(ensureUserInPeople(eventPeople, user, profile));
                    });
                } else {
                    setEventId(null);
                    setPeople(ensureUserInPeople([], user, profile));
                }
            }
            return;
        }

        if (activeSession && activeSession.id === billId) {
            setItemAssignments(activeSession.itemAssignments || {});
            setPeople(ensureUserInPeople(activeSession.people || [], user, profile));

            if (loadedSessionId.current !== activeSession.id) {
                setBillData(activeSession.billData || null);
                setSplitEvenly(activeSession.splitEvenly || false);
                setTitle(activeSession.title || '');
                setCurrentStep(activeSession.currentStep || 0);
                setEventId(activeSession.eventId || null);
                setAirbnbData(activeSession.airbnbData);
                loadedSessionId.current = activeSession.id;
            }
            setIsBillRendered(true);
            setLoadFailure(null);
        }
    }, [activeSession, billId, user, profile]);

    const hasLoadedBillId = useRef<string | null>(null);

    useEffect(() => {
        // Keyed by attempt too, so Try again re-runs the load for the same bill.
        const attemptKey = `${billId}#${loadAttempt}`;
        if (billId && attemptKey !== hasLoadedBillId.current) {
            hasLoadedBillId.current = attemptKey;
            loadBill(billId).catch((err) => ({ status: classifyBillLoadError(err) })).then((result) => {
                if (result.status === 'loaded') {
                    const fetchedBill = result.bill;
                    setFetchedBill(fetchedBill);
                    setBillData(fetchedBill.billData || null);
                    setItemAssignments(fetchedBill.itemAssignments || {});
                    setPeople(ensureUserInPeople(fetchedBill.people || [], user, profile));
                    setSplitEvenly(fetchedBill.splitEvenly || false);
                    setTitle(fetchedBill.title || '');
                    setCurrentStep(fetchedBill.currentStep || 0);
                    setEventId(fetchedBill.eventId || null);
                    setAirbnbData(fetchedBill.airbnbData);
                    setIsBillRendered(true);
                    setLoadFailure(null);
                } else {
                    setLoadFailure(result.status);
                }
            });
        }
    }, [billId, loadAttempt, loadBill, user, profile]);

    const hasProcessedNavState = useRef(false);

    useEffect(() => {
        if (hasProcessedNavState.current) return;

        const { resumeSessionId } = location.state || {};
        if (resumeSessionId) {
            hasProcessedNavState.current = true;
            resumeSession(resumeSessionId);
            navigate('.', { replace: true, state: {} });
        }
    }, []);

    // On timeout, return the user where they came from.
    const { goBack, label: backLabel } = useReturnTo({ eventId });

    useSessionTimeout({
        onTimeout: () => goBack(),
        timeoutMinutes: 20,
    });

    // The session for THIS page's bill. activeSession is only the user's latest
    // bill; an older one comes from the live list, else the one-off fetch.
    // Passing another bill here would make useBillSession drop every save.
    const billSession = !billId
        ? null
        : activeSession?.id === billId
            ? activeSession
            : savedSessions.find((b) => b.id === billId) ?? fetchedBill;

    const handleGenerateShareLink = async () => {
        if (!billSession?.id || !user) return;

        setIsGeneratingShareCode(true);
        try {
            await billService.generateShareCode(billSession.id, user.uid);
            setShowShareLinkDialog(true);
        } catch (error) {
            console.error('Error generating share code:', error);
        } finally {
            setIsGeneratingShareCode(false);
        }
    };

    const handleRegenerateShareLink = async () => {
        if (!billSession?.id || !user) return;

        setIsGeneratingShareCode(true);
        try {
            await billService.updateBill(billSession.id, {
                shareCode: deleteField() as unknown as string,
                shareCodeCreatedAt: deleteField() as unknown as import('firebase/firestore').Timestamp,
                shareCodeExpiresAt: deleteField() as unknown as import('firebase/firestore').Timestamp,
                shareCodeCreatedBy: deleteField() as unknown as string,
            });
            await billService.generateShareCode(billSession.id, user.uid);
        } catch (error) {
            console.error('Error regenerating share code:', error);
        } finally {
            setIsGeneratingShareCode(false);
        }
    };

    const formatDate = (timestamp: { toDate: () => Date } | null | undefined) => {
        if (!timestamp) return new Date().toLocaleDateString('en-US', {
            month: 'short', day: 'numeric', year: 'numeric'
        });
        const date = timestamp.toDate();
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

    if (loadFailure && !isBillRendered) {
        return (
            <BillLoadErrorState
                failure={loadFailure}
                onRetry={() => {
                    setLoadFailure(null);
                    setLoadAttempt((n) => n + 1);
                }}
                onBack={() => goBack()}
                backLabel={backLabel}
            />
        );
    }

    if (billId && !isBillRendered) {
        return (
            <div className="loading-container">
                <Loader2 className="loading-spinner" />
            </div>
        );
    }

    const effectiveSession = billSession;

    const handleEventChange = async (newEventId: string | null) => {
        setEventId(newEventId);

        if (newEventId) {
            const eventMembers = await fetchEventMembers(newEventId);
            const newPeople = ensureUserInPeople(eventMembers, user, profile);
            setPeople(newPeople);
            setItemAssignments({});

            // Converting to an event bill REPLACES people with the event
            // members, which legitimately drops private-bill guests.
            const newBillId = await saveSession({
                eventId: newEventId,
                billType: 'event',
                people: newPeople,
                itemAssignments: {},
            }, billId || activeSession?.id, { allowPeopleRemoval: true });

            if (!billId && newBillId && isMounted.current) {
                navigate(`/airbnb/${newBillId}`, { replace: true, state: DRAFT_CREATED_NAV_STATE });
            }
        } else {
            const newBillId = await saveSession({
                eventId: deleteField() as unknown as string,
                billType: 'private',
            }, billId || activeSession?.id);

            if (!billId && newBillId && isMounted.current) {
                navigate(`/airbnb/${newBillId}`, { replace: true, state: DRAFT_CREATED_NAV_STATE });
            }
        }
    };

    const handleSaveSession = async (
        sessionData: Partial<Bill>,
        id?: string,
        options?: { allowPeopleRemoval?: boolean },
    ) => {
        if (eventId && !sessionData.eventId) {
            sessionData.eventId = eventId;
            sessionData.billType = 'event';
        }
        // Make sure it saves with isAirbnb flag
        sessionData.isAirbnb = true;
        // Forward `options` or the people guard would silently lose intent.
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
                titlePlaceholder={formatDate(effectiveSession?.createdAt) + ' Trip'}
            />
            </div>

            <div className="flex-1 min-h-0 w-full">
            <AirbnbWizard
                activeSession={effectiveSession}
                billId={billId}
                saveSession={handleSaveSession}
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
                initialAirbnbData={airbnbData}
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
