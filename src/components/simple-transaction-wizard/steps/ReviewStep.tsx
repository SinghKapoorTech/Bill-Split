import { useAuth } from "@/contexts/AuthContext";
import { Person, BillData, ItemAssignment, PersonTotal } from "@/types";
import { Card } from "@/components/ui/card";
import { CheckCircle2, Loader2 } from "lucide-react";
import { SplitSummary } from "@/components/people/SplitSummary";
import { StepFooter } from "@/components/shared/StepFooter";

interface ReviewStepProps {
  amount: string;
  title: string;
  paidById: string;
  people: Person[];
  isSaving: boolean;
  onPrev: () => void;
  onComplete: () => void;
  currentStep: number;
  totalSteps: number;
}

export function ReviewStep({
  amount,
  title,
  paidById,
  people,
  isSaving,
  onPrev,
  onComplete,
  currentStep,
  totalSteps
}: ReviewStepProps) {
  const { user } = useAuth();
  
  const numAmount = Number(amount) || 0;
  const splitAmount = people.length > 0 ? numAmount / people.length : 0;
  
  // Construct dummy objects to satisfy SplitSummary
  const dummyBillData: BillData = {
    items: [{
      id: "dummy-item",
      name: title || "Expense",
      price: numAmount
    }],
    subtotal: numAmount,
    tax: 0,
    tip: 0,
    total: numAmount
  };

  const dummyItemAssignments: ItemAssignment = {
    "dummy-item": people.map(p => p.id)
  };

  const personTotals: PersonTotal[] = people.map(p => ({
    personId: p.id,
    name: p.name,
    itemsSubtotal: splitAmount,
    tax: 0,
    tip: 0,
    total: splitAmount
  }));

  return (
    <div className="flex flex-col gap-6 p-4 max-w-md mx-auto w-full">
      
      <div className="w-full">
        <SplitSummary
          personTotals={personTotals}
          allItemsAssigned={true}
          people={people}
          billData={dummyBillData}
          itemAssignments={dummyItemAssignments}
          paidById={paidById}
          ownerId={user?.uid}
        />
      </div>

      {isSaving && (
        <div className="flex flex-col items-center justify-center gap-2 p-4 text-muted-foreground mt-4 py-8">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
          <p className="text-sm font-medium animate-pulse">Saving expense...</p>
        </div>
      )}

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
