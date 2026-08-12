import { Card } from '@/components/ui/card';
import { useMemo } from 'react';
import { CheckCircle2 } from 'lucide-react';
import { SplitSummary } from '@/components/people/SplitSummary';
import { buildParticipantRoles } from '@/utils/billParticipants';
import { StepFooter } from '@/components/shared/StepFooter';
import { StepHeader } from '@/components/shared/StepHeader';
import { Person, BillData, ItemAssignment, PersonTotal } from '@/types';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { billService } from '@/services/billService';
import { arrayUnion, arrayRemove } from 'firebase/firestore';
import { SplitDonutChart } from '@/components/shared/SplitDonutChart';

export interface ReceiptThumbnailProps {
  imagePreview: string | null;
  selectedFile: File | null;
  isUploading: boolean;
  isAnalyzing: boolean;
  receiptImageUrl?: string;
  onImageSelected?: (fileOrBase64: File | string) => void;
  onAnalyze?: () => void;
  onRemoveImage?: () => void;
  isMobile: boolean;
  upload: ReturnType<typeof import('@/hooks/useFileUpload').useFileUpload>;
}

interface ReviewStepProps {
  billId?: string;
  billData: BillData | null;
  people: Person[];
  itemAssignments: ItemAssignment;
  personTotals: PersonTotal[];
  allItemsAssigned: boolean;
  settledPersonIds?: string[];
  paidById?: string;
  ownerId?: string;

  // Optional receipt thumbnail (only used by bill wizard)
  receipt?: ReceiptThumbnailProps;

  // Navigation
  onComplete: () => void;
  onPrev: () => void;
  currentStep: number;
  totalSteps: number;
}

/**
 * Step 4: Review & Complete
 * Final review of the split summary.
 * Shared by both the bill wizard and simple transaction wizard.
 */
export function ReviewStep({
  billId,
  billData,
  people,
  itemAssignments,
  personTotals,
  allItemsAssigned,
  settledPersonIds,
  paidById,
  ownerId,
  receipt,
  onComplete,
  onPrev,
  currentStep,
  totalSteps,
}: ReviewStepProps) {
  const hasReceipt = receipt && (receipt.imagePreview || receipt.receiptImageUrl);
  const hasItems = billData?.items && billData.items.length > 0;
  const { user } = useAuth();
  const { toast } = useToast();

  // Role tags ('Created' / 'Paid') shown next to each name. Mirrors the shared
  // /shared/:sessionId view (GuestClaimView:207), which was the only place this
  // was ever wired up — SplitSummary and SplitDonutChart both already render
  // `roleLabels`, they were just never given any here.
  const roleLabels = useMemo(
    () => buildParticipantRoles(people, ownerId, paidById),
    [people, ownerId, paidById],
  );

  const handleMarkAsSettled = async (personId: string, isSettled: boolean) => {
    if (!user || !billId || !billData) return;

    try {
      await billService.updateBill(billId, {
        settledPersonIds: (isSettled
          ? arrayUnion(personId)
          : arrayRemove(personId)) as unknown as string[],
      });

      toast({
        title: isSettled ? 'Marked as Settled' : 'Undo Settled',
        description: isSettled
          ? 'Their balance has been updated to $0 for this bill.'
          : 'Their balance has been restored for this bill.',
      });
    } catch (error) {
      console.error('Failed to mark as settled', error);
      toast({
        title: 'Error',
        description: 'Failed to mark as settled. Please try again.',
        variant: 'destructive',
      });
      throw error;
    }
  };

  return (
    <div>
      <Card className="bill-card-full-width">
        {receipt?.isMobile && hasReceipt && hasItems && (
          <StepHeader
            icon={CheckCircle2}
            title="Split Summary"
            showReceiptThumbnail={true}
            selectedFile={receipt.selectedFile}
            imagePreview={receipt.imagePreview}
            isDragging={receipt.upload.isDragging}
            isUploading={receipt.isUploading}
            isAnalyzing={receipt.isAnalyzing}
            isMobile={receipt.isMobile}
            receiptImageUrl={receipt.receiptImageUrl}
            upload={receipt.upload}
            onImageSelected={receipt.onImageSelected}
            onAnalyze={receipt.onAnalyze}
            onRemoveImage={receipt.onRemoveImage}
          />
        )}

        {allItemsAssigned && personTotals.length > 1 && billData && (
          <SplitDonutChart
            personTotals={personTotals}
            total={billData.total}
            roleLabels={roleLabels}
          />
        )}

        <SplitSummary
          personTotals={personTotals}
          allItemsAssigned={allItemsAssigned}
          people={people}
          billData={billData!}
          itemAssignments={itemAssignments}
          settledPersonIds={settledPersonIds}
          paidById={paidById}
          ownerId={ownerId}
          roleLabels={roleLabels}
          onMarkAsSettled={handleMarkAsSettled}
        />
      </Card>

      {/* Desktop only: StepFooter */}
      <div className="hidden md:block">
        <StepFooter
          currentStep={currentStep}
          totalSteps={totalSteps}
          onBack={onPrev}
          onComplete={onComplete}
          completeLabel="Done"
        />
      </div>
    </div>
  );
}
