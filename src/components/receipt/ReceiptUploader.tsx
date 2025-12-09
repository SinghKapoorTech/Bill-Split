import { useState, useEffect } from 'react';
import { Upload, X, ImageIcon, Loader2, Receipt, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { usePlatform } from '@/hooks/usePlatform';
import { useImagePicker } from '@/hooks/useImagePicker';
import { ReceiptPreviewModal } from './ReceiptPreviewModal';

interface Props {
  selectedFile: File | null;
  imagePreview: string | null;
  isDragging: boolean;
  isUploading: boolean;
  isAnalyzing: boolean;
  isMobile?: boolean;
  compactMode?: boolean;
  onFileInput: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void;
  onRemove: () => void;
  onAnalyze: () => void;
  onImageSelected?: (base64Image: string) => void;
  fileInputRef: React.RefObject<HTMLInputElement>;
}

export function ReceiptUploader({
  selectedFile,
  imagePreview,
  isDragging,
  isUploading,
  isAnalyzing,
  isMobile = false,
  compactMode = false,
  onFileInput,
  onDragOver,
  onDragLeave,
  onDrop,
  onRemove,
  onAnalyze,
  onImageSelected,
  fileInputRef,
}: Props) {
  const { isNative } = usePlatform();
  const { pickImage } = useImagePicker();
  const [imageError, setImageError] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);

  useEffect(() => {
    setImageError(false);
  }, [imagePreview]);

  const handleSelectImage = async () => {
    if (isNative && onImageSelected) {
      // Mobile: Use camera picker
      const image = await pickImage();
      if (image) {
        onImageSelected(image);
      }
    } else {
      // Web: Trigger file input
      fileInputRef.current?.click();
    }
  };

  const handleUseDemoImage = async () => {
    try {
      // Fetch the demo receipt image from public folder
      const response = await fetch('/demo-receipt.png');
      const blob = await response.blob();

      // Convert to File object
      const file = new File([blob], 'demo-receipt.png', { type: 'image/png' });

      // Convert to base64 for preview
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64Image = reader.result as string;
        if (onImageSelected) {
          onImageSelected(base64Image);
        }
      };
      reader.readAsDataURL(file);
    } catch (error) {
      console.error('Error loading demo image:', error);
    }
  };
  // Compact mode: Show only a small receipt thumbnail (for mobile after upload)
  if (compactMode && imagePreview) {
    return (
      <>
        <button
          onClick={() => setIsModalOpen(true)}
          className="flex-shrink-0 rounded-md overflow-hidden border-2 border-primary/40 hover:border-primary transition-all shadow-sm hover:shadow-md"
        >
          <img
            src={imagePreview}
            alt="Receipt thumbnail"
            className="w-10 h-10 object-cover"
          />
        </button>

        <ReceiptPreviewModal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          imageUrl={imagePreview}
          fileName={selectedFile?.name || 'Receipt'}
        />
      </>
    );
  }

  return (
    <Card
      className={`shadow-medium border-2 border-dashed transition-smooth ${imagePreview ? 'bill-card-tight' : 'p-4 md:p-8'
        } ${isDragging
          ? 'border-primary bg-primary/10 scale-[1.02]'
          : imagePreview
            ? 'border-primary/40'
            : 'border-primary/20 hover:border-primary/40'
        } ${isMobile && !imagePreview ? 'min-h-[60vh] flex items-center justify-center' : ''
        }`}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      {!imagePreview ? (
        <div className="flex flex-col items-center justify-center stack-md py-8 md:py-12">
          <div className="w-16 h-16 md:w-20 md:h-20 rounded-full bg-primary/10 flex items-center justify-center">
            <Upload className="w-8 h-8 md:w-10 md:h-10 text-primary" />
          </div>

          <div className="text-center space-y-2">
            <h3 className="responsive-text-lg font-semibold">Upload Your Receipt</h3>
            <p className="responsive-text-sm text-muted-foreground">
              Drag and drop or click to upload your bill
            </p>
          </div>

          {!isNative && (
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/heic,image/heif"
              onChange={onFileInput}
              className="hidden"
            />
          )}

          <Button
            size="lg"
            className="bg-gradient-to-r from-primary to-primary-glow hover:opacity-90 shadow-lg hover:shadow-xl transition-all duration-300"
            onClick={handleSelectImage}
          >
            <Upload className="mr-2 h-5 w-5" />
            {isNative ? 'Take Photo' : 'Choose File'}
          </Button>

          {!isNative && (
            <Button
              size="sm"
              variant="outline"
              className="border-primary/40 hover:bg-primary/10"
              onClick={handleUseDemoImage}
            >
              <Receipt className="mr-2 h-4 w-4" />
              Use Demo Image
            </Button>
          )}

          <p className="text-sm text-muted-foreground">
            Supports JPG, PNG, HEIC • Max 20MB
          </p>
        </div>
      ) : (
        <div className="stack-sm">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ImageIcon className="icon-md-responsive icon-primary" />
              <span className="font-medium responsive-text-sm truncate">{selectedFile?.name}</span>
            </div>
            <Button variant="ghost" size="sm" onClick={onRemove}>
              <X className="icon-sm-responsive" />
            </Button>
          </div>

          <div className="relative rounded-lg overflow-hidden border">
            {imageError ? (
              <div className="w-full h-48 md:h-80 flex flex-col items-center justify-center bg-muted text-muted-foreground">
                <ImageIcon className="w-10 h-10 mb-2" />
                <p>Could not load image.</p>
              </div>
            ) : (
              <img
                src={imagePreview || ''}
                alt="Receipt preview"
                className="w-full h-auto max-h-48 md:max-h-80 object-contain"
                onError={() => setImageError(true)}
              />
            )}
          </div>

          <Button
            size="lg"
            className="w-full bg-gradient-to-r from-primary to-primary-glow hover:opacity-90 shadow-lg hover:shadow-xl transition-smooth disabled:opacity-50"
            onClick={onAnalyze}
            disabled={isUploading || isAnalyzing}
          >
            {isUploading ? (
              <>
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                Uploading Receipt...
              </>
            ) : isAnalyzing ? (
              <>
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                Analyzing Receipt...
              </>
            ) : (
              <>
                <Sparkles className="mr-2 h-5 w-5" />
                Analyze Receipt
              </>
            )}
          </Button>
          {isAnalyzing && (
            <p className="text-caption-responsive text-muted-foreground text-center mt-2">
              This may take a few moments. AI is extracting items from your receipt...
            </p>
          )}
        </div>
      )}
    </Card>
  );
}
