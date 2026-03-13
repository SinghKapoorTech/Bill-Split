import { useState, useEffect, useRef } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { HeroSection } from '@/components/layout/HeroSection';
import { AirbnbWizard } from '@/components/airbnb-wizard/AirbnbWizard';
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

export default function AirbnbView() {
    const location = useLocation();
    const navigate = useNavigate();
    const { billId: routeBillId } = useParams<{ billId: string }>();
    const billId = routeBillId === 'new' ? undefined : routeBillId;
    const { user } = useAuth();
    const { profile } = useUserProfile();

    const {
        activeSession,
        isLoadingSessions,
        resumeSession,
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
        }
    }, [activeSession, billId, user, profile]);

    const hasLoadedBillId = useRef<string | null>(null);

    useEffect(() => {
        if (billId && billId !== hasLoadedBillId.current) {
            hasLoadedBillId.current = billId;
            resumeSession(billId, true).then((fetchedBill) => {
                if (fetchedBill) {
                    setBillData(fetchedBill.billData || null);
                    setItemAssignments(fetchedBill.itemAssignments || {});
                    setPeople(ensureUserInPeople(fetchedBill.people || [], user, profile));
                    setSplitEvenly(fetchedBill.splitEvenly || false);
                    setTitle(fetchedBill.title || '');
                    setCurrentStep(fetchedBill.currentStep || 0);
                    setEventId(fetchedBill.eventId || null);
                    setAirbnbData(fetchedBill.airbnbData);
                }
            });
        }
    }, [billId, resumeSession, user, profile]);

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

    useSessionTimeout({
        onTimeout: () => navigate('/dashboard'),
        timeoutMinutes: 20,
    });

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
            await billService.updateBill(activeSession.id, {
                shareCode: deleteField() as unknown as string,
                shareCodeCreatedAt: deleteField() as unknown as import('firebase/firestore').Timestamp,
                shareCodeExpiresAt: deleteField() as unknown as import('firebase/firestore').Timestamp,
                shareCodeCreatedBy: deleteField() as unknown as string,
            });
            await billService.generateShareCode(activeSession.id, user.uid);
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

    const isDataReady = !billId || loadedSessionId.current !== null;

    if (!isDataReady) {
        return (
            <div className="loading-container">
                <Loader2 className="loading-spinner" />
            </div>
        );
    }

    const isDraft = !billId;
    const effectiveSession = isDraft ? null : activeSession;

    const handleEventChange = async (newEventId: string | null) => {
        setEventId(newEventId);

        if (newEventId) {
            const eventMembers = await fetchEventMembers(newEventId);
            const newPeople = ensureUserInPeople(eventMembers, user, profile);
            setPeople(newPeople);
            setItemAssignments({});

            const newBillId = await saveSession({
                eventId: newEventId,
                billType: 'event',
                people: newPeople,
                itemAssignments: {},
            }, billId || activeSession?.id);

            if (!billId && newBillId) {
                navigate(`/airbnb/${newBillId}`, { replace: true });
            }
        } else {
            const newBillId = await saveSession({
                eventId: deleteField() as unknown as string,
                billType: 'private',
            }, billId || activeSession?.id);

            if (!billId && newBillId) {
                navigate(`/airbnb/${newBillId}`, { replace: true });
            }
        }
    };

    const handleSaveSession = async (sessionData: Partial<Bill>, id?: string) => {
        if (eventId && !sessionData.eventId) {
            sessionData.eventId = eventId;
            sessionData.billType = 'event';
        }
        // Make sure it saves with isAirbnb flag
        sessionData.isAirbnb = true;
        return saveSession(sessionData, id);
    };

    return (
        <>
            <HeroSection
                hasBillData={!!billData}
                onShare={handleGenerateShareLink}
                title={title}
                onTitleChange={setTitle}
                titlePlaceholder={formatDate(effectiveSession?.createdAt) + ' Trip'}
            />

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
