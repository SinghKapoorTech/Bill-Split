import { Person } from '@/types';
import { PeopleStepBase } from '@/components/shared/wizard-steps/PeopleStepBase';
import { SplitMethodSelector, SplitMethod } from '../SplitMethodSelector';

interface PeopleStepProps {
  people: Person[];
  setPeople: (people: Person[]) => void;
  peopleManager: ReturnType<typeof import('@/hooks/usePeopleManager').usePeopleManager>;
  isMobile: boolean;
  paidById: string;
  setPaidById: (val: string) => void;
  // Navigation
  onNext: () => void;
  onPrev: () => void;
  canProceed: boolean;
  currentStep: number;
  totalSteps: number;
  eventId?: string | null;
  onEventChange?: (eventId: string | null) => void;
  // Split method
  splitMethod: SplitMethod;
  onSplitMethodChange: (method: SplitMethod) => void;
  amount: number;
  percentages: Record<string, number>;
  onPercentagesChange: (percentages: Record<string, number>) => void;
  exactAmounts: Record<string, number>;
  onExactAmountsChange: (amounts: Record<string, number>) => void;
}

export function PeopleStep({
  people,
  setPeople,
  peopleManager,
  isMobile,
  paidById,
  setPaidById,
  onNext,
  onPrev,
  canProceed,
  currentStep,
  totalSteps,
  eventId,
  onEventChange,
  splitMethod,
  onSplitMethodChange,
  amount,
  percentages,
  onPercentagesChange,
  exactAmounts,
  onExactAmountsChange,
}: PeopleStepProps) {
  const handleUpdatePerson = async (personId: string, updates: Partial<Person>) => {
    const updatedPeople = people.map(p =>
      p.id === personId ? { ...p, ...updates } : p
    );
    setPeople(updatedPeople);
  };

  return (
    <div className="flex flex-col gap-6 p-0 max-w-md mx-auto">
      <PeopleStepBase
        people={people}
        setPeople={setPeople}
        newPersonName={peopleManager.newPersonName}
        newPersonVenmoId={peopleManager.newPersonVenmoId}
        onNameChange={peopleManager.setNewPersonName}
        onVenmoIdChange={peopleManager.setNewPersonVenmoId}
        onAdd={peopleManager.addPerson}
        onAddFromFriend={peopleManager.addFromFriend}
        onRemove={peopleManager.removePerson}
        onUpdate={handleUpdatePerson}
        onSaveAsFriend={peopleManager.savePersonAsFriend}
        paidById={paidById}
        onPaidByChange={setPaidById}
        isMobile={isMobile}
        onNext={onNext}
        onPrev={onPrev}
        canProceed={canProceed}
        currentStep={currentStep}
        totalSteps={totalSteps}
        eventId={eventId}
        onEventChange={onEventChange}
        splitMethod={splitMethod}
        onSplitMethodChange={onSplitMethodChange}
      />

      {people.length >= 2 && (
        <SplitMethodSelector
          splitMethod={splitMethod}
          people={people}
          amount={amount}
          percentages={percentages}
          onPercentagesChange={onPercentagesChange}
          exactAmounts={exactAmounts}
          onExactAmountsChange={onExactAmountsChange}
        />
      )}

      {people.length === 1 && (
        <div className="text-center text-sm text-amber-600 bg-amber-50 p-3 rounded-md mt-4">
          You need at least one other person to split an expense.
        </div>
      )}
    </div>
  );
}
