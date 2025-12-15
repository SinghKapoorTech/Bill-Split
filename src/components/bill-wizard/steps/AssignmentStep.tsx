import { Card } from '@/components/ui/card';
import { Receipt, Loader2 } from 'lucide-react';
import { BillItems } from '@/components/bill/BillItems';
import { ReceiptUploader } from '@/components/receipt/ReceiptUploader';
import { TwoColumnLayout, ReceiptPreview } from '@/components/shared/TwoColumnLayout';
import { StepFooter } from '@/components/shared/StepFooter';
import { StepHeader } from '@/components/shared/StepHeader';
import { Person, BillData, ItemAssignment } from '@/types';
import { UI_TEXT } from '@/utils/uiConstants';
import { useItemEditor } from '@/hooks/useItemEditor';

interface AssignmentStepProps {
    // Data
    billData: BillData | null;
    setBillData: (data: BillData | null) => void;
    people: Person[];
    itemAssignments: ItemAssignment;
    splitEvenly: boolean;

    // Event handlers
    onAssign: (itemId: string, personId: string, checked: boolean) => void;
    onToggleSplitEvenly: () => void;
    removePersonFromAssignments: (personId: string) => void;
    removeItemAssignments: (itemId: string) => void;

    // Receipt state (for mobile thumbnail)
    imagePreview: string | null;
    selectedFile: File | null;
    isUploading: boolean;
    isAnalyzing: boolean;
    isAIProcessing?: boolean;
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
    setBillData,
    people,
    itemAssignments,
    splitEvenly,
    onAssign,
    onToggleSplitEvenly,
    imagePreview,
    selectedFile,
    isUploading,
    isAnalyzing,
    isAIProcessing,
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
    upload,
    removeItemAssignments
}: AssignmentStepProps) {
    // Use the item editor hook for edit/delete functionality
    const editor = useItemEditor(billData, setBillData, removeItemAssignments);

    // Show loading overlay if AI is still processing
    if (isAIProcessing) {
        return (
            <div className="relative min-h-[500px] flex items-center justify-center">
                <div className="flex flex-col items-center gap-4">
                    <Loader2 className="h-12 w-12 animate-spin text-primary" />
                    <p className="text-lg text-muted-foreground">
                        Extracting items from receipt...
                    </p>
                    <p className="text-sm text-muted-foreground">
                        This usually takes a few seconds
                    </p>
                </div>
            </div>
        );
    }

    const hasReceipt = imagePreview || receiptImageUrl;
    const hasItems = billData?.items && billData.items.length > 0;

    const billItemsContent = (
        <BillItems
            billData={billData || { items: [], subtotal: 0, tax: 0, tip: 0, total: 0 }}
            people={people}
            itemAssignments={itemAssignments}
            editingItemId={editor.editingItemId}
            editingItemName={editor.editingItemName}
            editingItemPrice={editor.editingItemPrice}
            onAssign={onAssign}
            onEdit={editor.editItem}
            onSave={editor.saveEdit}
            onCancel={editor.cancelEdit}
            onDelete={editor.deleteItem}
            setEditingName={editor.setEditingItemName}
            setEditingPrice={editor.setEditingItemPrice}
            isAdding={editor.isAdding}
            newItemName={editor.newItemName}
            newItemPrice={editor.newItemPrice}
            setNewItemName={editor.setNewItemName}
            setNewItemPrice={editor.setNewItemPrice}
            onStartAdding={editor.startAdding}
            onAddItem={editor.addItem}
            onCancelAdding={editor.cancelAdding}
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
