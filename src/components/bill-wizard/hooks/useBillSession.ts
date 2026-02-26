import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Person, BillData, ItemAssignment } from '@/types';

interface UseBillSessionProps {
    // Data to auto-save
    billData: BillData | null;
    people: Person[];
    itemAssignments: ItemAssignment;
    splitEvenly: boolean;
    currentStep: number;
    title: string;

    // Active session info
    activeSession: any;
    billId?: string;
    receiptImageUrl?: string;
    receiptFileName?: string;

    // Save function from context
    saveSession: (data: any, id?: string) => Promise<string | null | void>;

    // Payment info
    paidById?: string;
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
    paidById
}: UseBillSessionProps) {
    const navigate = useNavigate();
    const isInitializing = useRef(true);
    const lastSavedData = useRef<string | null>(null);
    const pendingSaveTimeout = useRef<NodeJS.Timeout | null>(null);

    // Keep track of latest props for unmount saving
    const latestProps = useRef({
        billData, people, itemAssignments, splitEvenly, currentStep, title, activeSession, billId, receiptImageUrl, receiptFileName, saveSession, paidById
    });

    useEffect(() => {
        latestProps.current = {
            billData, people, itemAssignments, splitEvenly, currentStep, title, activeSession, billId, receiptImageUrl, receiptFileName, saveSession, paidById
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
    const executeSave = (options?: { isUnmounting?: boolean }) => {
        if (isInitializing.current) return;

        const props = latestProps.current;
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
            ...(props.splitEvenly ? { itemAssignments: props.itemAssignments } : {})
        });

        // If it's a draft and we don't have meaningul data yet, skip saving
        if (isDraft && !hasMeaningfulData) {
            return;
        }

        if (currentData !== lastSavedData.current || options?.isUnmounting) {
            const savePayload: any = {
                billData: props.billData,
                splitEvenly: props.splitEvenly,
                currentStep: props.currentStep,
            };

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

            const targetId = targetBillId || targetActiveId;

            const performSaveAndSwap = async () => {
                const returnedId = await props.saveSession(savePayload, targetId);

                // Silently swap the URL if this was a draft that just became a real document
                // Skip the swap if we are actively leaving the page to prevent hijacking navigation
                if (isDraft && returnedId && !options?.isUnmounting) {
                    navigate(`/bill/${returnedId}`, { replace: true });
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

        // Execute save immediately when navigating to a new step
        executeSave();

        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [currentStep, billId, activeSession?.id]);

    return {
        isInitializing: isInitializing.current,
        executeSave
    };
}
