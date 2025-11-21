import { ReactNode } from 'react';
import { Card } from '@/components/ui/card';
import { useIsMobile } from '@/hooks/use-mobile';
import { cn } from '@/lib/utils';

interface TwoColumnLayoutProps {
  leftColumn: ReactNode;
  rightColumn: ReactNode;
  leftColumnClassName?: string;
  rightColumnClassName?: string;
  className?: string;
}

export function TwoColumnLayout({
  leftColumn,
  rightColumn,
  leftColumnClassName,
  rightColumnClassName,
  className,
}: TwoColumnLayoutProps) {
  const isMobile = useIsMobile();

  if (isMobile) {
    // On mobile, stack vertically
    return (
      <div className={cn('space-y-6', className)}>
        {leftColumn}
        {rightColumn}
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
