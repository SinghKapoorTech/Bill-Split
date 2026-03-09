import { useState } from 'react';
import { Person, BillData } from '@/types';
import { UserPlus } from 'lucide-react';
import { useFriendSearch } from '@/hooks/useFriendSearch';
import { useAuth } from '@/contexts/AuthContext';
import { PeopleStepBase } from '@/components/shared/wizard-steps/PeopleStepBase';

interface AirbnbGuestsStepProps {
    people: Person[];
    setPeople: (people: Person[]) => void;
    billData: BillData | null;
    isMobile: boolean;
    onAdd: (name?: string, venmoId?: string) => void;
    onRemove: (id: string) => void;
    onUpdate: (id: string, updates: Partial<Person>) => void;
    onAddFromFriend: (friend: any) => void;
    onNext: () => void;
    onPrev: () => void;
    canProceed: boolean;
    currentStep: number;
    totalSteps: number;
    eventId?: string | null;
    onEventChange?: (eventId: string | null) => void;
    onSaveAsFriend?: (person: Person, contactInfo?: string) => void;
    onRemoveFriend?: (friendId: string) => void;
}

export function AirbnbGuestsStep({
    people,
    setPeople,
    billData,
    isMobile,
    onAdd,
    onRemove,
    onUpdate,
    onAddFromFriend,
    onNext,
    onPrev,
    canProceed,
    currentStep,
    totalSteps,
    eventId,
    onEventChange,
    onSaveAsFriend,
    onRemoveFriend
}: AirbnbGuestsStepProps) {
    const { user } = useAuth();
    const [newGuestName, setNewGuestName] = useState('');

    const existingNames = people.map(p => p.name);

    return (
        <div className="flex flex-col gap-6 fade-in max-w-xl mx-auto w-full">
            <div className="w-full">
                <PeopleStepBase
                    isMobile={isMobile}
                    people={people}
                    setPeople={setPeople}
                    newPersonName={newGuestName}
                    newPersonVenmoId=""
                    onNameChange={setNewGuestName}
                    onVenmoIdChange={() => { }}
                    onAdd={(name, venmoId) => {
                        const guestName = name || newGuestName;
                        if (guestName) onAdd(guestName, venmoId);
                        setNewGuestName('');
                    }}
                    onAddFromFriend={onAddFromFriend}
                    onRemove={onRemove}
                    onUpdate={async (id, updates) => onUpdate(id, updates)}
                    onSaveAsFriend={onSaveAsFriend || (() => { })}
                    onRemoveFriend={onRemoveFriend}
                    showFooter={!isMobile}
                    currentStep={currentStep}
                    totalSteps={totalSteps}
                    onNext={onNext}
                    onPrev={onPrev}
                    canProceed={canProceed}
                    eventId={eventId}
                    onEventChange={onEventChange}
                />
            </div>
        </div>
    );
}
