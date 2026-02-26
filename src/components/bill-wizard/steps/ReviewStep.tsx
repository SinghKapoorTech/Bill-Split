import { Card } from '@/components/ui/card';
import { CheckCircle2 } from 'lucide-react';
import { SplitSummary } from '@/components/people/SplitSummary';
import { ReceiptUploader } from '@/components/receipt/ReceiptUploader';
import { StepFooter } from '@/components/shared/StepFooter';
import { StepHeader } from '@/components/shared/StepHeader';
import { Person, BillData, ItemAssignment, PersonTotal } from '@/types';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { billService } from '@/services/billService';
import { ledgerService } from '@/services/ledgerService';
import { arrayUnion, arrayRemove } from 'firebase/firestore';

interface ReviewStepProps {
    // Data
    billId?: string;
    eventId?: string;
    billData: BillData | null;
    people: Person[];
    itemAssignments: ItemAssignment;
    personTotals: PersonTotal[];
    allItemsAssigned: boolean;
    settledPersonIds?: string[];

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
    billId,
    eventId,
    billData,
    people,
    itemAssignments,
    personTotals,
    allItemsAssigned,
    settledPersonIds,
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
    const { user } = useAuth();
    const { toast } = useToast();

    const handleMarkAsSettled = async (personId: string, isSettled: boolean) => {
        if (!user || !billId || !billData) return;

        try {
            // Update Firestore bill document
            // If isSettled is true, they want to mark as settled (arrayUnion)
            // If isSettled is false, they want to undo (arrayRemove)
            await billService.updateBill(billId, {
                settledPersonIds: (isSettled ? arrayUnion(personId) : arrayRemove(personId)) as unknown as string[]
            });

            // Need to update the active session's local state too - this happens naturally 
            // if we're listening to snapshot, but we explicitly force recalculate ledger
            toast({
                title: isSettled ? "Marked as Settled" : "Undo Settled",
                description: isSettled ? "Their balance has been updated to $0 for this bill." : "Their balance has been restored for this bill.",
            });

            // Reapply both ledgers atomically. The idempotent logic reads
            // settledPersonIds from the bill and automatically zeroes out the settled person's share.
            await ledgerService.applyBillToLedgers(
                billId,
                user.uid,
                personTotals,
                eventId || undefined
            );

        } catch (error) {
            console.error("Failed to mark as settled", error);
            toast({
                title: "Error",
                description: "Failed to mark as settled. Please try again.",
                variant: "destructive"
            });
            throw error;
        }
    };

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
                    billData={billData!}
                    itemAssignments={itemAssignments}
                    settledPersonIds={settledPersonIds}
                    paidById={(billData as any)?.paidById}
                    ownerId={(billData as any)?.ownerId}
                    onMarkAsSettled={handleMarkAsSettled}
                />
            </Card>

            {/* Desktop only: StepFooter */}
            <div className="hidden md:block">
                <StepFooter
                    currentStep={currentStep}
                    totalSteps={totalSteps}
                    onBack={onPrev}
                    onComplete={onComplete}
                    completeLabel="Done"
                />
            </div>
        </div>
    );
}
