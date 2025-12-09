import { Card } from '@/components/ui/card';
import { Receipt } from 'lucide-react';
import { BillItems } from '@/components/bill/BillItems';
import { ReceiptUploader } from '@/components/receipt/ReceiptUploader';
import { TwoColumnLayout, ReceiptPreview } from '@/components/shared/TwoColumnLayout';
import { StepFooter } from '@/components/shared/StepFooter';
import { StepHeader } from '@/components/shared/StepHeader';
import { Person, BillData, ItemAssignment } from '@/types';
import { UI_TEXT } from '@/utils/uiConstants';

interface AssignmentStepProps {
    // Data
    billData: BillData | null;
    people: Person[];
    itemAssignments: ItemAssignment;
    splitEvenly: boolean;

    // Event handlers
    onAssign: (itemId: string, personId: string, checked: boolean) => void;
    onToggleSplitEvenly: (itemId: string) => void;
    removePersonFromAssignments: (personId: string) => void;

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
    upload: any;
}

/**
 * Step 3: Assign Items
 * Assign bill items to people
 * Extracted from AIScanView lines 820-957
 */
export function AssignmentStep({
    billData,
    people,
    itemAssignments,
    splitEvenly,
    onAssign,
    onToggleSplitEvenly,
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
}: AssignmentStepProps) {
    const hasReceipt = imagePreview || receiptImageUrl;
    const hasItems = billData?.items && billData.items.length > 0;

    const billItemsContent = (
        <BillItems
            billData={billData || { items: [], subtotal: 0, tax: 0, tip: 0, total: 0 }}
            people={people}
            itemAssignments={itemAssignments}
            editingItemId={null}
            editingItemName=""
            editingItemPrice=""
            onAssign={onAssign}
            onEdit={() => { }}
            onSave={() => { }}
            onCancel={() => { }}
            onDelete={() => { }}
            setEditingName={() => { }}
            setEditingPrice={() => { }}
            isAdding={false}
            newItemName=""
            newItemPrice=""
            setNewItemName={() => { }}
            setNewItemPrice={() => { }}
            onStartAdding={() => { }}
            onAddItem={() => { }}
            onCancelAdding={() => { }}
            splitEvenly={splitEvenly}
            onToggleSplitEvenly={onToggleSplitEvenly}
        />
    );

    // Mobile with receipt
    if (isMobile && hasReceipt && hasItems) {
        return (
            <div>
                <Card className="bill-card-full-width">
                    <StepHeader
                        icon={Receipt}
                        title={UI_TEXT.BILL_ITEMS}
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

                    {!canProceed && (
                        <p className="text-caption-center py-4 mt-4">
                            Assign each item to at least one person to continue
                        </p>
                    )}

                    {billItemsContent}
                </Card>

                <StepFooter
                    currentStep={currentStep}
                    totalSteps={totalSteps}
                    onBack={onPrev}
                    onNext={onNext}
                    nextDisabled={!canProceed}
                />
            </div>
        );
    }

    // Desktop or mobile without receipt
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
                    <Card className="bill-card-full-width">
                        <div className="section-header">
                            <Receipt className="icon-md icon-primary" />
                            <h3 className="section-title">{UI_TEXT.BILL_ITEMS}</h3>
                        </div>

                        {!canProceed && (
                            <p className="text-caption-center py-4 mt-4">
                                Assign each item to at least one person to continue
                            </p>
                        )}

                        {billItemsContent}
                    </Card>
                }
            />

            <StepFooter
                currentStep={currentStep}
                totalSteps={totalSteps}
                onBack={onPrev}
                onNext={onNext}
                nextDisabled={!canProceed}
            />
        </div>
    );
}
