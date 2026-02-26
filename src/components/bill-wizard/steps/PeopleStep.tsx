import { Person, BillData } from '@/types';
import { PeopleStepBase } from '@/components/shared/wizard-steps/PeopleStepBase';

interface PeopleStepProps {
    // Data
    people: Person[];
    setPeople: (people: Person[]) => void;
    billData: BillData | null;
    
    // People manager props
    newPersonName: string;
    newPersonVenmoId: string;
    onNameChange: (name: string) => void;
    onVenmoIdChange: (id: string) => void;
    onAdd: (name?: string, venmoId?: string) => void;
    onAddFromFriend: (friend: any) => void;
    onRemove: (personId: string) => void;
    onUpdate: (personId: string, updates: Partial<Person>) => Promise<void>;
    onSaveAsFriend: (person: Person) => void;
    onRemoveFriend?: (friendId: string) => void;

    // Payment info
    paidById?: string;
    onPaidByChange?: (paidById: string) => void;

    // Receipt state (for mobile thumbnail)
    imagePreview: string | null;
    selectedFile: File | null;
    isUploading: boolean;
    isAnalyzing: boolean;
    receiptImageUrl?: string;
    onImageSelected?: (fileOrBase64: File | string) => void;
    onAnalyze?: () => void;
    onRemoveImage?: () => void;

    // Navigation
    onNext: () => void;
    onPrev: () => void;
    canProceed: boolean;
    currentStep: number;
    totalSteps: number;

    // Utility
    isMobile: boolean;
    upload: any; // useFileUpload hook result
}

/**
 * Step 2: Add People
 * Refactored to use shared PeopleStepBase
 */
export function PeopleStep(props: PeopleStepProps) {
    const hasItems = props.billData?.items && props.billData.items.length > 0;

    return (
        <PeopleStepBase
            {...props}
            hasItems={!!hasItems}
        />
    );
}
