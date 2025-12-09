import { Share2, Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { UI_TEXT } from '@/utils/uiConstants';

interface Props {
  hasBillData: boolean;
  onShare?: () => void;
  title?: string;
  onTitleChange?: (title: string) => void;
  titlePlaceholder?: string;
}

export function HeroSection({ hasBillData, onShare, title, onTitleChange, titlePlaceholder }: Props) {
  return (
    <div className="text-center mb-4 md:mb-12 space-y-3 md:space-y-4">
      {title !== undefined && onTitleChange ? (
        /* Show editable title with visual cues */
        <div className="max-w-2xl mx-auto px-4">
          <div className="flex items-center gap-2 justify-center bg-secondary/30 hover:bg-secondary/50 border border-border/50 rounded-lg px-4 py-3 transition-colors group">
            <Input
              id="hero-bill-title"
              type="text"
              value={title}
              onChange={(e) => onTitleChange(e.target.value)}
              placeholder={titlePlaceholder || 'Bill Title'}
              className="text-2xl md:text-4xl font-bold text-center border-0 focus-visible:ring-0 px-0 h-auto bg-transparent"
            />
            <Pencil className="w-5 h-5 md:w-6 md:h-6 text-muted-foreground group-hover:text-foreground transition-colors flex-shrink-0" />
          </div>
        </div>
      ) : (
        /* Fallback if no title provided */
        <h2 className="text-4xl md:text-6xl font-extrabold tracking-tight text-foreground drop-shadow-sm">
          {UI_TEXT.SPLIT_YOUR_BILL}
        </h2>
      )}

      <div className="flex gap-2 justify-center mt-2 flex-wrap">
        {hasBillData && onShare && (
          <Button variant="info" size="sm" onClick={onShare}>
            <Share2 className="w-4 h-4 mr-2" />
            Share
          </Button>
        )}
      </div>
    </div>
  );
}
