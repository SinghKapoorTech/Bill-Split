import { Card } from '@/components/ui/card';
import { Users } from 'lucide-react';
import { PeopleManager } from '@/components/people/PeopleManager';
import { TwoColumnLayout, ReceiptPreview } from '@/components/shared/TwoColumnLayout';
import { ReceiptUploader } from '@/components/receipt/ReceiptUploader';
import { StepFooter } from '@/components/shared/StepFooter';
import { StepHeader } from '@/components/shared/StepHeader';
import { Person, BillData } from '@/types';

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
 * Manages the list of people splitting the bill
 * Extracted from AIScanView lines 735-818
 */
export function PeopleStep({
    people,
    setPeople,
    billData,
    newPersonName,
    newPersonVenmoId,
    onNameChange,
    onVenmoIdChange,
    onAdd,
    onAddFromFriend,
    onRemove,
    onUpdate,
    onSaveAsFriend,
    onRemoveFriend,
    imagePreview,
    selectedFile,
    isUploading,
    isAnalyzing,
    receiptImageUrl,
    onImageSelected,
    onAnalyze,
    onRemoveImage,
    onNext,
    onPrev,
    canProceed,
    currentStep,
    totalSteps,
    isMobile,
    upload
}: PeopleStepProps) {
    const hasReceipt = imagePreview || receiptImageUrl;
    const hasItems = billData?.items && billData.items.length > 0;

    // Mobile with receipt: Show compact thumbnail
    if (isMobile && hasReceipt && hasItems) {
        return (
            <div>
                <Card className="bill-card-tight">
                    <StepHeader
                        icon={Users}
                        title="People"
                        showReceiptThumbnail={true}
                        selectedFile={selectedFile}
                        imagePreview={imagePreview}
                        isDragging={upload.isDragging}
                        isUploading={isUploading}
                        isAnalyzing={isAnalyzing}
                        isMobile={isMobile}
                        receiptImageUrl={receiptImageUrl}
                        upload={upload}
                        onImageSelected={onImageSelected}
                        onAnalyze={onAnalyze}
                        onRemoveImage={onRemoveImage}
                    />

                    <div className="mobile-hide-child-chrome">
                        <PeopleManager
                            people={people}
                            newPersonName={newPersonName}
                            newPersonVenmoId={newPersonVenmoId}
                            onNameChange={onNameChange}
                            onVenmoIdChange={onVenmoIdChange}
                            onAdd={onAdd}
                            onAddFromFriend={onAddFromFriend}
                            onRemove={onRemove}
                            onUpdate={onUpdate}
                            onSaveAsFriend={onSaveAsFriend}
                            onRemoveFriend={onRemoveFriend}
                            setPeople={setPeople}
                        />
                    </div>
                </Card>

                {/* Desktop only: StepFooter */}
                <div className="hidden md:block">
                    <StepFooter
                        currentStep={currentStep}
                        totalSteps={totalSteps}
                        onBack={onPrev}
                        onNext={onNext}
                        nextDisabled={!canProceed}
                    />
                </div>
            </div>
        );
    }

    // Desktop or mobile without receipt: Use layout
    return (
        <div>
            <TwoColumnLayout
                imageUrl={receiptImageUrl || imagePreview}
                leftColumn={
                    !isMobile && (receiptImageUrl || imagePreview) ? (
                        <ReceiptPreview imageUrl={receiptImageUrl || imagePreview} />
                    ) : null
                }
                rightColumn={
                    <PeopleManager
                        people={people}
                        newPersonName={newPersonName}
                        newPersonVenmoId={newPersonVenmoId}
                        onNameChange={onNameChange}
                        onVenmoIdChange={onVenmoIdChange}
                        onAdd={onAdd}
                        onAddFromFriend={onAddFromFriend}
                        onRemove={onRemove}
                        onUpdate={onUpdate}
                        onSaveAsFriend={onSaveAsFriend}
                        onRemoveFriend={onRemoveFriend}
                        setPeople={setPeople}
                    />
                }
            />

            {/* Desktop only: StepFooter */}
            <div className="hidden md:block">
                <StepFooter
                    currentStep={currentStep}
                    totalSteps={totalSteps}
                    onBack={onPrev}
                    onNext={onNext}
                    nextDisabled={!canProceed}
                />
            </div>
        </div>
    );
}
