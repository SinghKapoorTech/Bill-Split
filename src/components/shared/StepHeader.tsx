import { LucideIcon } from 'lucide-react';
import { ReceiptUploader } from '@/components/receipt/ReceiptUploader';

interface StepHeaderProps {
    icon: LucideIcon;
    title: string;

    // Receipt thumbnail props (for mobile compact mode)
    showReceiptThumbnail?: boolean;
    selectedFile?: File | null;
    imagePreview?: string | null;
    isDragging?: boolean;
    isUploading?: boolean;
    isAnalyzing?: boolean;
    isMobile?: boolean;
    receiptImageUrl?: string;
    upload?: any; // useFileUpload hook result
    onImageSelected?: (fileOrBase64: File | string) => void;
    onAnalyze?: () => void;
    onRemoveImage?: () => void;
    actions?: React.ReactNode;
}

/**
 * Reusable Step Header Component
 * Used across all wizard steps for consistent UI
 * Shows icon, title, and optional compact receipt thumbnail on mobile
 */
export function StepHeader({
    icon: Icon,
    title,
    showReceiptThumbnail,
    selectedFile,
    imagePreview,
    isDragging,
    isUploading,
    isAnalyzing,
    isMobile,
    receiptImageUrl,
    upload,
    onImageSelected,
    onAnalyze,
    onRemoveImage,
    actions
}: StepHeaderProps) {
    return (
        <div className="section-header flex items-center justify-between">
            <div className="flex items-center gap-2">
                <Icon className="icon-md-responsive icon-primary" />
                <h3 className="section-title-responsive">{title}</h3>
            </div>

            <div className="flex items-center gap-2">
                {actions}

                {showReceiptThumbnail && (imagePreview || receiptImageUrl) && upload && (
                    <ReceiptUploader
                        selectedFile={selectedFile || null}
                        imagePreview={imagePreview || null}
                        isDragging={isDragging || false}
                        isUploading={isUploading || false}
                        isAnalyzing={isAnalyzing || false}
                        isMobile={isMobile || false}
                        compactMode={true}
                        onFileInput={(e) => e.target.files && onImageSelected?.(e.target.files[0])}
                        onDragOver={upload.handleDragOver}
                        onDragLeave={upload.handleDragLeave}
                        onDrop={(e) => {
                            upload.handleDrop(e);
                            const file = e.dataTransfer.files?.[0];
                            if (file) onImageSelected?.(file);
                        }}
                        onRemove={onRemoveImage || (() => { })}
                        onAnalyze={onAnalyze || (() => { })}
                        onImageSelected={onImageSelected}
                        fileInputRef={upload.fileInputRef}
                    />
                )}
            </div>
        </div>
    );
}
