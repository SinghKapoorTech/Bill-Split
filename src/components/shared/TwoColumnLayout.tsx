import { ReactNode } from 'react';
import { Card } from '@/components/ui/card';
import { useIsMobile } from '@/hooks/use-mobile';
import { cn } from '@/lib/utils';

interface TwoColumnLayoutProps {
  leftColumn?: ReactNode;
  rightColumn: ReactNode;
  leftColumnClassName?: string;
  rightColumnClassName?: string;
  className?: string;
  imageUrl?: string | null; // Pass image URL to determine if we should center
}

export function TwoColumnLayout({
  leftColumn,
  rightColumn,
  leftColumnClassName,
  rightColumnClassName,
  className,
  imageUrl,
}: TwoColumnLayoutProps) {
  const isMobile = useIsMobile();

  // Determine if we should center based on imageUrl
  const shouldCenter = !imageUrl;

  if (isMobile) {
    // On mobile, stack vertically
    return (
      <div className={cn('space-y-6', className)}>
        {imageUrl && leftColumn}
        {rightColumn}
      </div>
    );
  }

  // On desktop, center if no image, otherwise show side by side
  if (shouldCenter) {
    return (
      <div className={cn('flex justify-center', className)}>
        <div className="w-full max-w-3xl">
          {rightColumn}
        </div>
      </div>
    );
  }

  // On desktop, show side by side
  return (
    <div className={cn('grid grid-cols-2 gap-6', className)}>
      <div className={leftColumnClassName}>{leftColumn}</div>
      <div className={rightColumnClassName}>{rightColumn}</div>
    </div>
  );
}

interface ReceiptPreviewProps {
  imageUrl: string | null;
  className?: string;
}

export function ReceiptPreview({ imageUrl, className }: ReceiptPreviewProps) {
  if (!imageUrl) return null;

  return (
    <Card className={cn('p-4 sticky top-4', className)}>
      <h4 className="text-sm font-medium mb-3 text-muted-foreground">Receipt</h4>
      <div className="rounded-lg overflow-hidden border border-border">
        <img
          src={imageUrl}
          alt="Receipt"
          className="w-full h-auto object-contain max-h-[600px]"
        />
      </div>
    </Card>
  );
}
