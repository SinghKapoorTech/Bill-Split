import { useState, useRef } from 'react';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { submitFeedback } from '@/services/feedbackService';
import { Loader2, Bug, Lightbulb, ImagePlus, X } from 'lucide-react';

interface FeedbackModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function FeedbackModal({ open, onOpenChange }: FeedbackModalProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [type, setType] = useState<'bug' | 'suggestion'>('bug');
  const [message, setMessage] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const resetForm = () => {
    setType('bug');
    setMessage('');
    setFiles([]);
    previews.forEach((url) => URL.revokeObjectURL(url));
    setPreviews([]);
  };

  const handleClose = (open: boolean) => {
    if (!open) resetForm();
    onOpenChange(open);
  };

  const handleAddImages = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files;
    if (!selected) return;
    const newFiles = Array.from(selected);
    setFiles((prev) => [...prev, ...newFiles]);
    const newPreviews = newFiles.map((f) => URL.createObjectURL(f));
    setPreviews((prev) => [...prev, ...newPreviews]);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleRemoveImage = (index: number) => {
    URL.revokeObjectURL(previews[index]);
    setFiles((prev) => prev.filter((_, i) => i !== index));
    setPreviews((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async () => {
    if (!user || !message.trim()) return;
    setIsSubmitting(true);
    try {
      await submitFeedback({
        userId: user.uid,
        userName: user.displayName || 'Anonymous',
        userEmail: user.email || '',
        type,
        message: message.trim(),
        files,
      });
      toast({
        title: 'Feedback submitted',
        description: 'Thank you! Your feedback helps us improve.',
      });
      handleClose(false);
    } catch (error) {
      console.error('Error submitting feedback:', error);
      toast({
        title: 'Submission failed',
        description: 'Something went wrong. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent
        className="sm:max-w-md"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <DialogTitle className="text-lg font-semibold">
          Send Feedback
        </DialogTitle>
        <DialogDescription className="sr-only">
          Report a bug or suggest a feature
        </DialogDescription>

        <div className="space-y-4 pt-2">
          {/* Type selector */}
          <div className="flex gap-2">
            <Button
              type="button"
              variant={type === 'bug' ? 'default' : 'outline'}
              className="flex-1 gap-2"
              onClick={() => setType('bug')}
            >
              <Bug className="w-4 h-4" />
              Bug Report
            </Button>
            <Button
              type="button"
              variant={type === 'suggestion' ? 'default' : 'outline'}
              className="flex-1 gap-2"
              onClick={() => setType('suggestion')}
            >
              <Lightbulb className="w-4 h-4" />
              Suggestion
            </Button>
          </div>

          {/* Message */}
          <Textarea
            placeholder={
              type === 'bug'
                ? 'Describe the issue you encountered...'
                : 'Describe your idea or suggestion...'
            }
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={4}
            className="resize-none"
          />

          {/* Image upload */}
          <div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={handleAddImages}
            />
            {previews.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-3">
                {previews.map((src, i) => (
                  <div key={i} className="relative w-16 h-16 rounded-lg overflow-hidden border">
                    <img
                      src={src}
                      alt={`Screenshot ${i + 1}`}
                      className="w-full h-full object-cover"
                    />
                    <button
                      type="button"
                      onClick={() => handleRemoveImage(i)}
                      className="absolute -top-1 -right-1 w-5 h-5 bg-destructive text-destructive-foreground rounded-full flex items-center justify-center text-xs"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              className="gap-2"
            >
              <ImagePlus className="w-4 h-4" />
              Add Screenshots
            </Button>
          </div>

          {/* Submit */}
          <Button
            type="button"
            className="w-full"
            onClick={handleSubmit}
            disabled={isSubmitting || !message.trim()}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
                Submitting...
              </>
            ) : (
              'Submit Feedback'
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
