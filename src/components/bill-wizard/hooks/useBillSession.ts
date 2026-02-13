import { useEffect, useRef } from 'react';
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
    saveSession: (data: any, id?: string) => void;
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
    saveSession
}: UseBillSessionProps) {
    const isInitializing = useRef(true);
    const lastSavedData = useRef<string | null>(null);

    // Mark initialization complete after initial render
    useEffect(() => {
        const timer = setTimeout(() => {
            isInitializing.current = false;
        }, 200);
        return () => clearTimeout(timer);
    }, [activeSession?.id]);

        // Debounced auto-save with dirty checking
    useEffect(() => {
        // Don't auto-save during initialization
        if (isInitializing.current) return;

        const timeoutId = setTimeout(() => {
            // Double-check we're not in a transition state
            if (isInitializing.current) return;

            // CRITICAL: Ensure we're saving to the correct bill
            if (billId && activeSession?.id && billId !== activeSession.id) {
                return;
            }

            // Create a snapshot of current data for dirty checking
            // EXCLUDING people and itemAssignments as they are now atomic
            const currentData = JSON.stringify({
                billData,
                // people, // Atomic
                // itemAssignments, // Atomic
                splitEvenly,
                currentStep,
                title,
            });

            // Only save if data has actually changed
            if (currentData !== lastSavedData.current) {
                const savePayload: any = {
                    billData,
                    // people,
                    // itemAssignments,
                    splitEvenly,
                    currentStep,
                };

                // Only include receipt fields if they exist
                if (receiptImageUrl) {
                    savePayload.receiptImageUrl = receiptImageUrl;
                }
                if (receiptFileName) {
                    savePayload.receiptFileName = receiptFileName;
                }

                if (title) {
                    savePayload.title = title;
                }

                saveSession(savePayload, billId || activeSession?.id);

                lastSavedData.current = currentData;
            }
        }, 3000); // Debounce by 3 seconds

        return () => clearTimeout(timeoutId);
    }, [billData, splitEvenly, currentStep, title]);

    return {
        isInitializing: isInitializing.current
    };
}
