import { Person, BillData, ItemAssignment } from '@/types';

// Step definition
export interface Step {
    id: number;
    label: string;
    description: string;
}

// Props passed to each step component
export interface StepProps {
    // Data state
    billData: BillData | null;
    setBillData: (data: BillData | null) => void;
    people: Person[];
    setPeople: (people: Person[]) => void;
    itemAssignments: ItemAssignment;
    setItemAssignments: (assignments: ItemAssignment) => void;
    splitEvenly: boolean;
    setSplitEvenly: (split: boolean) => void;
    title: string;

    // Navigation
    onNext: () => void;
    onPrev: () => void;
    canProceed: boolean;
    currentStep: number;
    totalSteps: number;

    // Receipt/upload state
    imagePreview: string | null;
    selectedFile: File | null;
    isUploading: boolean;
    isAnalyzing: boolean;
    receiptImageUrl?: string;
    receiptFileName?: string;

    // Mobile state
    isMobile: boolean;
}

// Wizard state for useBillWizard hook
export interface WizardState {
    currentStep: number;
    setCurrentStep: (step: number) => void;
    handleNextStep: () => void;
    handlePrevStep: () => void;
    canProceedFromStep: (step: number) => boolean;
    canNavigateToStep: (stepIndex: number) => boolean;
}
