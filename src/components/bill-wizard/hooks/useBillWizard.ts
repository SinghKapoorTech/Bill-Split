import { useState, useCallback, useEffect, useRef } from 'react';
import { Person, BillData, ItemAssignment } from '@/types';
import { areAllItemsAssigned } from '@/utils/calculations';
import { WizardState } from '../types';
import { App } from '@capacitor/app';
import { usePlatform } from '@/hooks/usePlatform';

interface UseBillWizardProps {
    billData: BillData | null;
    people: Person[];
    itemAssignments: ItemAssignment;
    totalSteps: number;
    initialStep?: number;
    minStep?: number;
    customValidator?: (step: number) => boolean;
}

/**
 * Hook to manage bill wizard step navigation and validation
 * Extracted from AIScanView to separate step management logic
 */
export function useBillWizard({
    billData,
    people,
    itemAssignments,
    totalSteps,
    initialStep = 0,
    minStep = 0,
    customValidator
}: UseBillWizardProps): WizardState {
    const [currentStep, setCurrentStep] = useState(initialStep);
    const { isNative } = usePlatform();

    // Store currentStep in a ref for the back button listener
    const stepRef = useRef(currentStep);
    useEffect(() => {
        stepRef.current = currentStep;
    }, [currentStep]);

    // Handle hardware back button for Android
    useEffect(() => {
        if (!isNative) return;

        let listenerHandle: any = null;

        App.addListener('backButton', () => {
            if (stepRef.current > minStep) {
                // Go back a step in the wizard
                setCurrentStep(prev => prev - 1);
            } else {
                // At minimum step, fallback to default behavior (exit or go back in history)
                window.history.back();
            }
        }).then(handle => {
            listenerHandle = handle;
        });

        return () => {
            if (listenerHandle) {
                listenerHandle.remove();
            }
        };
    }, [isNative]);

    // Step navigation
    const handleNextStep = useCallback(() => {
        if (currentStep < totalSteps - 1) {
            setCurrentStep(currentStep + 1);
        }
    }, [currentStep, totalSteps]);

    const handlePrevStep = useCallback(() => {
        if (currentStep > minStep) {
            setCurrentStep(currentStep - 1);
        }
    }, [currentStep, minStep]);

    // Validation for step progression
    const canProceedFromStep = useCallback((step: number): boolean => {
        if (customValidator) {
            return customValidator(step);
        }

        switch (step) {
            case 0: // Bill Entry step (merged Upload + Items)
                return billData?.items?.length > 0; // Need at least one item
            case 1: // People step
                return people.length > 1; // Need at least one person other than the current user
            case 2: // Assign step
                return areAllItemsAssigned(billData, itemAssignments); // All items must be assigned
            case 3: // Review step
                return true; // Final step
            default:
                return false;
        }
    }, [billData, people, itemAssignments, customValidator]);

    // Determine which steps can be navigated to
    const canNavigateToStep = useCallback((stepIndex: number): boolean => {
        // Always allow navigating to current step or previous steps
        if (stepIndex <= currentStep) {
            return true;
        }

        // For future steps, check if all previous steps are completed
        for (let i = 0; i < stepIndex; i++) {
            if (!canProceedFromStep(i)) {
                return false;
            }
        }
        return true;
    }, [currentStep, canProceedFromStep]);

    return {
        currentStep,
        setCurrentStep,
        handleNextStep,
        handlePrevStep,
        canProceedFromStep,
        canNavigateToStep
    };
}
