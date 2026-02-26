import { Person } from '@/types';
import { PeopleStepBase } from '@/components/shared/wizard-steps/PeopleStepBase';

interface PeopleStepProps {
  people: Person[];
  setPeople: (people: Person[]) => void;
  peopleManager: any; // Return type of usePeopleManager
  isMobile: boolean;
  paidById: string;
  setPaidById: (val: string) => void;
  // Navigation
  onNext: () => void;
  onPrev: () => void;
  canProceed: boolean;
  currentStep: number;
  totalSteps: number;
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
  totalSteps
}: PeopleStepProps) {
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
        onUpdate={peopleManager.updatePerson}
        onSaveAsFriend={peopleManager.savePersonAsFriend}
        paidById={paidById}
        onPaidByChange={setPaidById}
        isMobile={isMobile}
        onNext={onNext}
        onPrev={onPrev}
        canProceed={canProceed}
        currentStep={currentStep}
        totalSteps={totalSteps}
      />
      
      {people.length === 1 && (
         <div className="text-center text-sm text-amber-600 bg-amber-50 p-3 rounded-md mt-4">
           You need at least one other person to split an expense.
         </div>
      )}
    </div>
  );
}
