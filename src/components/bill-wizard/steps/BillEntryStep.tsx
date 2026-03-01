import { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Receipt, Sparkles } from 'lucide-react';
import { ReceiptUploader } from '@/components/receipt/ReceiptUploader';
import { BillItems } from '@/components/bill/BillItems';
import { BillSummary } from '@/components/bill/BillSummary';
import { TwoColumnLayout } from '@/components/shared/TwoColumnLayout';
import { StepFooter } from '@/components/shared/StepFooter';
import { StepHeader } from '@/components/shared/StepHeader';
import { TabSelector } from '@/components/shared/TabSelector';
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
    onTriggerSave?: (options?: { overrideData?: Partial<any>, forceSave?: boolean }) => void;
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
    removeItemAssignments,
    onTriggerSave
}: BillEntryStepProps) {
    const upload = useFileUpload();
    const editor = useItemEditor(
        billData,
        setBillData,
        removeItemAssignments,
        // Trigger save when item edited, added, removed
        (newBillData) => {
            onTriggerSave?.({ overrideData: { billData: newBillData }, forceSave: true });
        }
    );

    // Tab state for mobile view
    const [activeTab, setActiveTab] = useState<'ai' | 'manual'>('ai');

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

    // Auto-switch to manual tab after analysis completes
    useEffect(() => {
        if (hasReceipt && hasItems && !isAnalyzing && isMobile) {
            // Add small delay for smooth UX transition
            const timeout = setTimeout(() => {
                setActiveTab('manual');
            }, 400);
            return () => clearTimeout(timeout);
        }
    }, [hasReceipt, hasItems, isAnalyzing, isMobile]);

    // Mobile: Tab-based layout
    if (isMobile) {
        return (
            <div>
                <div className="stack-lg">
                    {/* Tab Selector */}
                    <div className="flex justify-center mb-6">
                        <TabSelector
                            tabs={[
                                { id: 'ai', label: 'AI Scan', icon: Sparkles },
                                { id: 'manual', label: 'Manual', icon: Receipt },
                            ]}
                            activeTab={activeTab}
                            onTabChange={(tab) => setActiveTab(tab as 'ai' | 'manual')}
                        />
                    </div>

                    {/* AI Scan Tab Content */}
                    {activeTab === 'ai' && (
                        <div className="fade-in">
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
                        </div>
                    )}

                    {/* Manual Entry Tab Content */}
                    {activeTab === 'manual' && (
                        <div className="fade-in">
                            <Card className="bill-card-full-width">
                                <div className="section-header">
                                    <Receipt className="icon-md icon-primary" />
                                    <h3 className="section-title">{UI_TEXT.BILL_ITEMS}</h3>
                                </div>
                                <p className="text-description-mb">
                                    {hasReceipt && hasItems
                                        ? 'Review and edit the extracted items'
                                        : 'Add items manually or switch to AI Scan tab to upload a receipt'}
                                </p>

                                <BillItems {...billItemsProps} />

                                <BillSummary
                                    billData={billData || { items: [], subtotal: 0, tax: 0, tip: 0, total: 0 }}
                                    onUpdate={(updates) => {
                                        const newBillData = { ...(billData || { items: [], subtotal: 0, tax: 0, tip: 0, total: 0 }), ...updates };
                                        setBillData(newBillData);
                                        onTriggerSave?.({ overrideData: { billData: newBillData }, forceSave: true });
                                    }}
                                />
                            </Card>
                        </div>
                    )}
                </div>

                {/* Desktop only: StepFooter */}
                <div className="hidden md:block">
                    <StepFooter
                        currentStep={currentStep}
                        totalSteps={totalSteps}
                        onNext={onNext}
                        nextDisabled={!canProceed}
                    />
                </div>
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
                            onUpdate={(updates) => {
                                const newBillData = { ...(billData || { items: [], subtotal: 0, tax: 0, tip: 0, total: 0 }), ...updates };
                                setBillData(newBillData);
                                onTriggerSave?.({ overrideData: { billData: newBillData }, forceSave: true });
                            }}
                        />
                    </Card>
                }
            />

            {/* Desktop only: StepFooter */}
            <div className="hidden md:block">
                <StepFooter
                    currentStep={currentStep}
                    totalSteps={totalSteps}
                    onNext={onNext}
                    nextDisabled={!canProceed}
                />
            </div>
        </div>
    );
}
