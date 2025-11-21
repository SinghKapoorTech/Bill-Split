import { RotateCcw, Save, Share2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { UI_TEXT } from '@/utils/uiConstants';

interface Props {
  hasBillData: boolean;
  onLoadMock: () => void;
  onStartOver: () => void;
  onSave: () => void;
  onShare?: () => void;
}

export function HeroSection({ hasBillData, onLoadMock, onStartOver, onSave, onShare }: Props) {
  return (
    <div className="text-center mb-4 md:mb-12 space-y-3 md:space-y-4">
      <h2 className="text-4xl md:text-6xl font-extrabold tracking-tight text-foreground drop-shadow-sm">
        {UI_TEXT.SPLIT_YOUR_BILL}
      </h2>
      <p className="text-base md:text-lg text-muted-foreground max-w-2xl mx-auto">
        {UI_TEXT.UPLOAD_RECEIPT_INSTRUCTION}
      </p>
      <div className="flex gap-2 justify-center mt-2 flex-wrap">
        {/* <Button variant="outline" size="sm" onClick={onLoadMock}>
          Load Test Data
        </Button> */}
        {hasBillData && (
          <>
            {onShare && (
              <Button variant="info" size="sm" onClick={onShare}>
                <Share2 className="w-4 h-4 mr-2" />
                Share
              </Button>
            )}
            <Button variant="success" size="sm" onClick={onSave}>
              <Save className="w-4 h-4 mr-2" />
              Save
            </Button>
            <Button variant="warning" size="sm" onClick={onStartOver}>
              <RotateCcw className="w-4 h-4 mr-2" />
              {UI_TEXT.START_OVER}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
