import { Card } from '@/components/ui/card';
import { CheckCircle2 } from 'lucide-react';
import { SplitSummary } from '@/components/people/SplitSummary';
import { ReceiptUploader } from '@/components/receipt/ReceiptUploader';
import { StepFooter } from '@/components/shared/StepFooter';
import { StepHeader } from '@/components/shared/StepHeader';
import { Person, BillData, ItemAssignment, PersonTotal } from '@/types';

interface ReviewStepProps {
    // Data
    billData: BillData | null;
    people: Person[];
    itemAssignments: ItemAssignment;
    personTotals: PersonTotal[];
    allItemsAssigned: boolean;

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
    onComplete: () => void;
    onPrev: () => void;
    currentStep: number;
    totalSteps: number;

    // Utility
    isMobile: boolean;
    upload: any;
}

/**
 * Step 4: Review & Complete
 * Final review of the split summary
 * Extracted from AIScanView lines 958-1006
 */
export function ReviewStep({
    billData,
    people,
    itemAssignments,
    personTotals,
    allItemsAssigned,
    imagePreview,
    selectedFile,
    isUploading,
    isAnalyzing,
    receiptImageUrl,
    onImageSelected,
    onAnalyze,
    onRemoveImage,
    onComplete,
    onPrev,
    currentStep,
    totalSteps,
    isMobile,
    upload
}: ReviewStepProps) {
    const hasReceipt = imagePreview || receiptImageUrl;
    const hasItems = billData?.items && billData.items.length > 0;

    return (
        <div>
            <Card className="bill-card-full-width">
                {isMobile && hasReceipt && hasItems && (
                    <StepHeader
                        icon={CheckCircle2}
                        title="Split Summary"
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
                )}

                <SplitSummary
                    personTotals={personTotals}
                    allItemsAssigned={allItemsAssigned}
                    people={people}
                    billData={billData}
                    itemAssignments={itemAssignments}
                />
            </Card>

            <StepFooter
                currentStep={currentStep}
                totalSteps={totalSteps}
                onBack={onPrev}
                onComplete={onComplete}
                completeLabel="Done"
            />
        </div>
    );
}
