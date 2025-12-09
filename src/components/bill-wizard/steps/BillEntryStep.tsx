import { Card } from '@/components/ui/card';
import { Receipt, Sparkles } from 'lucide-react';
import { ReceiptUploader } from '@/components/receipt/ReceiptUploader';
import { BillItems } from '@/components/bill/BillItems';
import { BillSummary } from '@/components/bill/BillSummary';
import { TwoColumnLayout } from '@/components/shared/TwoColumnLayout';
import { StepFooter } from '@/components/shared/StepFooter';
import { StepHeader } from '@/components/shared/StepHeader';
import { UI_TEXT } from '@/utils/uiConstants';
import { useFileUpload } from '@/hooks/useFileUpload';
import { useItemEditor } from '@/hooks/useItemEditor';
import { BillData } from '@/types';

interface BillEntryStepProps {
    // Data
    billData: BillData | null;
    setBillData: (data: BillData | null) => void;

    // Receipt state
    imagePreview: string | null;
    selectedFile: File | null;
    isUploading: boolean;
    isAnalyzing: boolean;
    receiptImageUrl?: string;

    // Event handlers
    onAnalyze: () => void;
    onRemoveImage: () => void;
    onImageSelected: (fileOrBase64: File | string) => void;

    // Navigation
    onNext: () => void;
    canProceed: boolean;
    currentStep: number;
    totalSteps: number;

    // Utility
    isMobile: boolean;
    removeItemAssignments: (itemId: string) => void;
}

/**
 * Step 1: Bill Entry
 * Handles receipt upload and bill items editing
 * Extracted from AIScanView lines 515-732
 */
export function BillEntryStep({
    billData,
    setBillData,
    imagePreview,
    selectedFile,
    isUploading,
    isAnalyzing,
    receiptImageUrl,
    onAnalyze,
    onRemoveImage,
    onImageSelected,
    onNext,
    canProceed,
    currentStep,
    totalSteps,
    isMobile,
    removeItemAssignments
}: BillEntryStepProps) {
    const upload = useFileUpload();
    const editor = useItemEditor(
        billData,
        setBillData,
        removeItemAssignments
    );

    const billItemsProps = {
        billData: billData || { items: [], subtotal: 0, tax: 0, tip: 0, total: 0 },
        people: [],
        itemAssignments: {},
        editingItemId: editor.editingItemId,
        editingItemName: editor.editingItemName,
        editingItemPrice: editor.editingItemPrice,
        onAssign: () => { },
        onEdit: editor.editItem,
        onSave: editor.saveEdit,
        onCancel: editor.cancelEdit,
        onDelete: editor.deleteItem,
        setEditingName: editor.setEditingItemName,
        setEditingPrice: editor.setEditingItemPrice,
        isAdding: editor.isAdding,
        newItemName: editor.newItemName,
        newItemPrice: editor.newItemPrice,
        setNewItemName: editor.setNewItemName,
        setNewItemPrice: editor.setNewItemPrice,
        onStartAdding: editor.startAdding,
        onAddItem: editor.addItem,
        onCancelAdding: editor.cancelAdding,
        splitEvenly: false,
        onToggleSplitEvenly: () => { },
    };

    const hasReceipt = imagePreview || receiptImageUrl;
    const hasItems = billData?.items && billData.items.length > 0;

    // Mobile with analyzed receipt: Show compact thumbnail
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
                    <p className="text-description-mb">
                        Add items manually or upload a receipt to extract them automatically
                    </p>

                    <BillItems {...billItemsProps} />

                    <BillSummary
                        billData={billData || { items: [], subtotal: 0, tax: 0, tip: 0, total: 0 }}
                        onUpdate={(updates) => setBillData({ ...billData, ...updates })}
                    />
                </Card>

                <StepFooter
                    currentStep={currentStep}
                    totalSteps={totalSteps}
                    onNext={onNext}
                    nextDisabled={!canProceed}
                />
            </div>
        );
    }

    // Mobile without analyzed receipt: Vertical layout
    if (isMobile) {
        return (
            <div>
                <div className="stack-lg">
                    <ReceiptUploader
                        selectedFile={selectedFile}
                        imagePreview={imagePreview}
                        isDragging={upload.isDragging}
                        isUploading={isUploading}
                        isAnalyzing={isAnalyzing}
                        isMobile={isMobile}
                        onFileInput={(e) => e.target.files && onImageSelected(e.target.files[0])}
                        onDragOver={upload.handleDragOver}
                        onDragLeave={upload.handleDragLeave}
                        onDrop={(e) => {
                            upload.handleDrop(e);
                            const file = e.dataTransfer.files?.[0];
                            if (file) onImageSelected(file);
                        }}
                        onRemove={onRemoveImage}
                        onAnalyze={onAnalyze}
                        onImageSelected={onImageSelected}
                        fileInputRef={upload.fileInputRef}
                    />

                    <Card className="bill-card-full-width">
                        <div className="section-header">
                            <Receipt className="icon-md icon-primary" />
                            <h3 className="section-title">{UI_TEXT.BILL_ITEMS}</h3>
                        </div>
                        <p className="text-description-mb">
                            Add items manually or upload a receipt to extract them automatically
                        </p>

                        <BillItems {...billItemsProps} />

                        <BillSummary
                            billData={billData || { items: [], subtotal: 0, tax: 0, tip: 0, total: 0 }}
                            onUpdate={(updates) => setBillData({ ...billData, ...updates })}
                        />
                    </Card>
                </div>

                <StepFooter
                    currentStep={currentStep}
                    totalSteps={totalSteps}
                    onNext={onNext}
                    nextDisabled={!canProceed}
                />
            </div>
        );
    }

    // Desktop: Two-column layout
    return (
        <div>
            <TwoColumnLayout
                imageUrl={receiptImageUrl || imagePreview}
                leftColumn={
                    <Card className="bill-card-sticky">
                        <h3 className="text-lg font-semibold mb-4 flex-center gap-2">
                            <Sparkles className="icon-md icon-primary" />
                            Receipt Upload
                        </h3>
                        <p className="text-description-mb">
                            Upload a photo of your receipt and let AI extract items automatically
                        </p>
                        <ReceiptUploader
                            selectedFile={selectedFile}
                            imagePreview={imagePreview}
                            isDragging={upload.isDragging}
                            isUploading={isUploading}
                            isAnalyzing={isAnalyzing}
                            isMobile={isMobile}
                            onFileInput={(e) => e.target.files && onImageSelected(e.target.files[0])}
                            onDragOver={upload.handleDragOver}
                            onDragLeave={upload.handleDragLeave}
                            onDrop={(e) => {
                                upload.handleDrop(e);
                                const file = e.dataTransfer.files?.[0];
                                if (file) onImageSelected(file);
                            }}
                            onRemove={onRemoveImage}
                            onAnalyze={onAnalyze}
                            onImageSelected={onImageSelected}
                            fileInputRef={upload.fileInputRef}
                        />
                    </Card>
                }
                rightColumn={
                    <Card className="bill-card-full-width">
                        <div className="section-header">
                            <Receipt className="icon-md icon-primary" />
                            <h3 className="section-title">{UI_TEXT.BILL_ITEMS}</h3>
                        </div>
                        <p className="text-description-mb">
                            Add items manually or upload a receipt to extract them automatically
                        </p>

                        <BillItems {...billItemsProps} />

                        <BillSummary
                            billData={billData || { items: [], subtotal: 0, tax: 0, tip: 0, total: 0 }}
                            onUpdate={(updates) => setBillData({ ...billData, ...updates })}
                        />
                    </Card>
                }
            />

            <StepFooter
                currentStep={currentStep}
                totalSteps={totalSteps}
                onNext={onNext}
                nextDisabled={!canProceed}
            />
        </div>
    );
}
