import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Copy, Check, RefreshCw, Share2, Calendar } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { Timestamp } from 'firebase/firestore';
import { getExpirationDateString } from '@/utils/billSessionAdapter';

interface ShareLinkDialogProps {
  isOpen: boolean;
  onClose: () => void;
  billId: string;
  shareCode?: string;
  expiresAt?: Timestamp;
  onRegenerate: () => Promise<void>;
  isRegenerating?: boolean;
}

export function ShareLinkDialog({
  isOpen,
  onClose,
  billId,
  shareCode = '',
  expiresAt,
  onRegenerate,
  isRegenerating = false,
}: ShareLinkDialogProps) {
  const [copied, setCopied] = useState(false);

  const shareUrl = shareCode ? `${window.location.origin}/join/${billId}?code=${shareCode}` : '';
  const isLoading = !shareCode;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('Failed to copy:', error);
    }
  };

  const isExpired = expiresAt && expiresAt.toMillis() < Date.now();

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Share2 className="w-5 h-5 text-primary" />
            Share This Bill
          </DialogTitle>
          <DialogDescription>
            Share this link with others so they can view and collaborate on this bill
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* QR Code */}
          <div className="flex justify-center p-4 bg-white rounded-lg">
            {isLoading ? (
              <div className="w-[200px] h-[200px] flex items-center justify-center">
                <RefreshCw className="w-8 h-8 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <QRCodeSVG value={shareUrl} size={200} level="M" />
            )}
          </div>

          {/* Share Code Display */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Share Code</label>
            <div className="flex gap-2">
              <Input
                value={isLoading ? 'Generating...' : shareCode}
                readOnly
                className="font-mono text-lg text-center tracking-wider"
                disabled={isLoading}
              />
            </div>
          </div>

          {/* Share URL */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Share Link</label>
            <div className="flex gap-2">
              <Input value={shareUrl} readOnly className="text-sm" />
              <Button
                variant="outline"
                size="icon"
                onClick={handleCopy}
                className="shrink-0"
              >
                {copied ? (
                  <Check className="w-4 h-4 text-green-600" />
                ) : (
                  <Copy className="w-4 h-4" />
                )}
              </Button>
            </div>
          </div>

          {/* Expiration Info */}
          {expiresAt && (
            <div className={`flex items-center gap-2 text-sm ${isExpired ? 'text-destructive' : 'text-muted-foreground'}`}>
              <Calendar className="w-4 h-4" />
              <span>
                {isExpired ? 'Expired' : 'Expires'}: {getExpirationDateString(expiresAt)}
              </span>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-2 pt-2">
            <Button
              variant="outline"
              onClick={onRegenerate}
              disabled={isRegenerating}
              className="flex-1 gap-2"
            >
              <RefreshCw className={`w-4 h-4 ${isRegenerating ? 'animate-spin' : ''}`} />
              Regenerate Link
            </Button>
            <Button onClick={onClose} className="flex-1">
              Done
            </Button>
          </div>

          {/* Help Text */}
          <p className="text-xs text-muted-foreground text-center">
            Anyone with this link can view and edit this bill. The link expires in 7 days.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
