import { useState, useCallback } from 'react';
import { BillData, ItemAssignment } from '@/types';
import { areAllItemsAssigned } from '@/utils/calculations';
import { WizardState } from '../types';

interface UseBillWizardProps {
    billData: BillData | null;
    people: any[];
    itemAssignments: ItemAssignment;
    totalSteps: number;
    initialStep?: number;
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
    initialStep = 0
}: UseBillWizardProps): WizardState {
    const [currentStep, setCurrentStep] = useState(initialStep);

    // Step navigation
    const handleNextStep = useCallback(() => {
        if (currentStep < totalSteps - 1) {
            setCurrentStep(currentStep + 1);
        }
    }, [currentStep, totalSteps]);

    const handlePrevStep = useCallback(() => {
        if (currentStep > 0) {
            setCurrentStep(currentStep - 1);
        }
    }, [currentStep]);

    // Validation for step progression
    const canProceedFromStep = useCallback((step: number): boolean => {
        switch (step) {
            case 0: // Bill Entry step (merged Upload + Items)
                return billData?.items?.length > 0; // Need at least one item
            case 1: // People step
                return people.length > 0; // Need at least one person
            case 2: // Assign step
                return areAllItemsAssigned(billData, itemAssignments); // All items must be assigned
            case 3: // Review step
                return true; // Final step
            default:
                return false;
        }
    }, [billData, people, itemAssignments]);

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
