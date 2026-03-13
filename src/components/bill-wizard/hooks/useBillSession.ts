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

        const currentData = JSON.stringify({
            billData: props.billData,
            splitEvenly: props.splitEvenly,
            currentStep: props.currentStep,
            title: props.title,
            paidById: props.paidById,
            airbnbData: props.airbnbData,
            ...(props.splitEvenly ? { itemAssignments: props.itemAssignments } : {})
        });

        // If it's a draft and we don't have meaningul data yet, skip saving
        if (isDraft && !hasMeaningfulData) {
            return;
        }

        const isDifferent = currentData !== lastSavedData.current;

        if (isDifferent || options?.isUnmounting || options?.forceSave) {
            const savePayload: Partial<Bill> & { status?: string } = {
                billData: props.billData,
                splitEvenly: props.splitEvenly,
                currentStep: props.currentStep,
            };

            // Keep status as draft if we haven't finished the wizard
            if (isDraft || (targetActiveId && latestProps.current.activeSession?.status === 'draft')) {
                savePayload.status = 'draft';
            }

            // If we are creating a draft for the first time, we must include the people array
            // otherwise the bill will be uniquely created with 0 people.
            if (isDraft) {
                savePayload.people = props.people;
            }

            if (props.splitEvenly) {
                savePayload.itemAssignments = props.itemAssignments;
            }

            if (props.receiptImageUrl) savePayload.receiptImageUrl = props.receiptImageUrl;
            if (props.receiptFileName) savePayload.receiptFileName = props.receiptFileName;
            if (props.title) savePayload.title = props.title;
            if (props.paidById) savePayload.paidById = props.paidById;
            if (props.isAirbnb) savePayload.isAirbnb = props.isAirbnb;
            if (props.airbnbData) savePayload.airbnbData = props.airbnbData;

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

                const saveOperation = props.saveSession(savePayload, actualTargetId);

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
