import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Person, BillData, ItemAssignment } from '@/types';
import { Bill } from '@/types/bill.types';

interface UseBillSessionProps {
    // Data to auto-save
    billData: BillData | null;
    people: Person[];
    itemAssignments: ItemAssignment;
    splitEvenly: boolean;
    currentStep: number;
    title: string;

    // Active session info
    activeSession: Bill | null;
    billId?: string;
    receiptImageUrl?: string;
    receiptFileName?: string;

    // Save function from context
    saveSession: (data: Partial<Bill>, id?: string) => Promise<string | null | void>;

    // Payment info
    paidById?: string;

    // Optional base URL for draft redirection (e.g. '/airbnb')
    baseUrl?: string;

    // Airbnb specific
    isAirbnb?: boolean;
    airbnbData?: Bill['airbnbData'];
}

/**
 * Hook to manage auto-save functionality for bill wizard
 * Handles debounced saving with dirty checking
 * Extracted from AIScanView to separate auto-save logic
 */
export function useBillSession({
    billData,
    people,
    itemAssignments,
    splitEvenly,
    currentStep,
    title,
    activeSession,
    billId,
    receiptImageUrl,
    receiptFileName,
    saveSession,
    paidById,
    baseUrl,
    isAirbnb,
    airbnbData
}: UseBillSessionProps) {
    const navigate = useNavigate();
    const isInitializing = useRef(true);
    const lastSavedData = useRef<string | null>(null);
    const pendingSaveTimeout = useRef<NodeJS.Timeout | null>(null);
    const pendingDraftCreation = useRef<Promise<string | null | void> | null>(null);
    const skipNextAutoSave = useRef(false);

    // Keep track of latest props for unmount saving
    const latestProps = useRef({
        billData, people, itemAssignments, splitEvenly, currentStep, title, activeSession, billId, receiptImageUrl, receiptFileName, saveSession, paidById, baseUrl, isAirbnb, airbnbData
    });

    useEffect(() => {
        latestProps.current = {
            billData, people, itemAssignments, splitEvenly, currentStep, title, activeSession, billId, receiptImageUrl, receiptFileName, saveSession, paidById, baseUrl, isAirbnb, airbnbData
        };
    });

    // Mark initialization complete after initial render
    useEffect(() => {
        const timer = setTimeout(() => {
            isInitializing.current = false;
        }, 200);
        return () => clearTimeout(timer);
    }, [activeSession?.id]);

    // Function to execute the save logic sync/async
    const executeSave = (options?: { isUnmounting?: boolean, overrideData?: Partial<UseBillSessionProps>, forceSave?: boolean }) => {
        if (isInitializing.current) return;

        const props = { ...latestProps.current, ...(options?.overrideData || {}) };
        const targetBillId = props.billId;
        const targetActiveId = props.activeSession?.id;

        // CRITICAL: Ensure we're saving to the correct bill
        if (targetBillId && targetActiveId && targetBillId !== targetActiveId) {
            return;
        }

        const isDraft = !targetBillId && !targetActiveId;
        const hasMeaningfulData = props.billData?.items?.length || props.receiptImageUrl || props.receiptFileName || props.title;

        // Shared by the capture-time dirty check and the write-time bookkeeping,
        // so `lastSavedData` always describes what was ACTUALLY written.
        const serialize = (p: typeof props) => JSON.stringify({
            billData: p.billData,
            splitEvenly: p.splitEvenly,
            currentStep: p.currentStep,
            title: p.title,
            paidById: p.paidById,
            airbnbData: p.airbnbData,
            ...(p.splitEvenly ? { itemAssignments: p.itemAssignments } : {})
        });

        const currentData = serialize(props);

        // If it's a draft and we don't have meaningul data yet, skip saving
        if (isDraft && !hasMeaningfulData) {
            return;
        }

        const isDifferent = currentData !== lastSavedData.current;

        if (isDifferent || options?.isUnmounting || options?.forceSave) {
            const targetId = targetBillId || targetActiveId;

            const performSaveAndSwap = async () => {
                let actualTargetId = targetId;

                // If a draft creation is already in progress, wait for it so we can UPDATE it instead of creating another
                if (!actualTargetId && pendingDraftCreation.current) {
                    try {
                        const createdId = await pendingDraftCreation.current;
                        if (typeof createdId === 'string') {
                            actualTargetId = createdId;
                        } else if (latestProps.current.activeSession?.id) {
                            actualTargetId = latestProps.current.activeSession?.id;
                        }
                    } catch (e) {
                        // ignore error from previous creation, let this one try
                    }
                }

                // ── Build the payload HERE, at write time, not at capture ──
                //
                // This function may have just awaited `pendingDraftCreation`,
                // so an arbitrary amount of time can have passed since
                // `executeSave` was entered. Every field below is a whole-value
                // REPLACE, so a payload captured earlier overwrites anything
                // that changed while we were parked.
                //
                // That is exactly the production data-loss bug: a payload
                // captured while the bill was still a draft committed ~1.3s
                // later and erased a guest added in between. `people` was the
                // field that got noticed because `ledgerProcessor` reversed the
                // guest's share, but `itemAssignments` and `paidById` carry the
                // same money risk — stale assignments give a real participant
                // $0, and a stale `paidById` flips the creditor anchor and so
                // the DIRECTION of every debt on the bill.
                //
                // `BillWizard`'s split-evenly self-heal masks the assignments
                // case while the wizard stays mounted, but not if the parked
                // write lands after unmount. So re-read everything.
                const fresh = { ...latestProps.current, ...(options?.overrideData || {}) };

                const savePayload: Partial<Bill> & { status?: string } = {
                    billData: fresh.billData,
                    splitEvenly: fresh.splitEvenly,
                    currentStep: fresh.currentStep,
                };

                // `status` and `people` may ONLY ride a creation. Decided from
                // `actualTargetId` (what we know NOW), never from the
                // capture-time `isDraft`: for an existing bill `people` is a
                // whole-array replace that would delete whoever is missing, and
                // `status` would push a completed bill back to 'draft'. The
                // draft→active transition belongs to handleDone() alone.
                if (!actualTargetId) {
                    savePayload.status = 'draft';
                    // A creation must carry people or the bill is created empty.
                    savePayload.people = fresh.people;
                }

                if (fresh.splitEvenly) {
                    savePayload.itemAssignments = fresh.itemAssignments;
                }

                if (fresh.receiptImageUrl) savePayload.receiptImageUrl = fresh.receiptImageUrl;
                if (fresh.receiptFileName) savePayload.receiptFileName = fresh.receiptFileName;
                if (fresh.title) savePayload.title = fresh.title;
                if (fresh.paidById) savePayload.paidById = fresh.paidById;
                if (fresh.isAirbnb) savePayload.isAirbnb = fresh.isAirbnb;
                if (fresh.airbnbData) savePayload.airbnbData = fresh.airbnbData;

                // Re-point the dirty marker at what we are actually writing, so
                // a later identical state is not mistaken for a pending change.
                lastSavedData.current = serialize(fresh);

                const saveOperation = fresh.saveSession(savePayload, actualTargetId);

                // Track this promise if it's a creation
                if (!actualTargetId) {
                    pendingDraftCreation.current = saveOperation;
                }

                try {
                    const returnedId = await saveOperation;

                    // Silently swap the URL if this was a draft that just became a real document
                    // Skip the swap if we are actively leaving the page to prevent hijacking navigation
                    if (!actualTargetId && returnedId && !options?.isUnmounting) {
                        const basePath = props.baseUrl || '/bill';
                        navigate(`${basePath}/${returnedId}`, { replace: true });
                    }
                } finally {
                    if (!actualTargetId && pendingDraftCreation.current === saveOperation) {
                        pendingDraftCreation.current = null;
                    }
                }
            };

            performSaveAndSwap();
            // Synchronous dedup only: this suppresses a second executeSave for
            // an unchanged state while the one above is parked. The marker is
            // re-pointed at the payload actually sent inside
            // performSaveAndSwap (see `lastSavedData.current = serialize(fresh)`),
            // which runs before this line on the no-await path and after it on
            // the await path — so the newest write always wins.
            lastSavedData.current = currentData;
        }
    };

    // Flush on unmount (navigation to dashboard/events) or tab close
    useEffect(() => {
        const handleBeforeUnload = () => {
            if (pendingSaveTimeout.current) {
                clearTimeout(pendingSaveTimeout.current);
            }
            executeSave({ isUnmounting: true });
        };

        window.addEventListener('beforeunload', handleBeforeUnload);

        return () => {
            window.removeEventListener('beforeunload', handleBeforeUnload);
            if (pendingSaveTimeout.current) {
                clearTimeout(pendingSaveTimeout.current);
            }
            executeSave({ isUnmounting: true });
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Step-change auto-save (executes ONLY when changing wizard steps)
    useEffect(() => {
        // Don't auto-save during initialization
        if (isInitializing.current) return;

        // Skip if a direct save just happened (e.g. after receipt analysis)
        if (skipNextAutoSave.current) {
            skipNextAutoSave.current = false;
            return;
        }

        // Execute save immediately when navigating to a new step
        executeSave();

        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [currentStep, billId, activeSession?.id]);

    return {
        isInitializing: isInitializing.current,
        executeSave,
        skipNextStepSave: () => { skipNextAutoSave.current = true; },
        registerExternalCreation: (promise: Promise<string | null | void>) => {
            pendingDraftCreation.current = promise;
        },
    };
}
