import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

interface ReceiptPreviewModalProps {
    isOpen: boolean;
    onClose: () => void;
    imageUrl: string;
    fileName?: string;
}

export function ReceiptPreviewModal({
    isOpen,
    onClose,
    imageUrl,
    fileName = 'Receipt',
}: ReceiptPreviewModalProps) {
    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="max-w-4xl max-h-[90vh] p-0 overflow-hidden">
                <DialogHeader className="p-4 pb-0">
                    <DialogTitle className="text-lg font-semibold">{fileName}</DialogTitle>
                </DialogHeader>
                <div className="p-4 overflow-auto max-h-[calc(90vh-4rem)]">
                    <img
                        src={imageUrl}
                        alt="Receipt preview"
                        className="w-full h-auto object-contain"
                    />
                </div>
            </DialogContent>
        </Dialog>
    );
}
