import { Card } from '@/components/ui/card';
import { Users } from 'lucide-react';
import { PeopleManager } from '@/components/people/PeopleManager';
import { Person } from '@/types';
import { useAuth } from "@/contexts/AuthContext";
import { useUserProfile } from "@/hooks/useUserProfile";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface PeopleStepProps {
  people: Person[];
  setPeople: (people: Person[]) => void;
  peopleManager: any; // Return type of usePeopleManager
  isMobile: boolean;
  paidById: string;
  setPaidById: (val: string) => void;
}

export function PeopleStep({
  people,
  setPeople,
  peopleManager,
  isMobile,
  paidById,
  setPaidById
}: PeopleStepProps) {
  const { user } = useAuth();
  const { profile } = useUserProfile();
  const friends = profile?.friends || [];
  return (
    <div className="flex flex-col gap-6 p-4 max-w-md mx-auto">
      <Card className="overflow-hidden border-none shadow-none md:border-solid md:shadow-sm">
        <div className="mobile-hide-child-chrome p-0">
          <PeopleManager
            people={people}
            newPersonName={peopleManager.newPersonName}
            newPersonVenmoId={peopleManager.newPersonVenmoId}
            onNameChange={peopleManager.setNewPersonName}
            onVenmoIdChange={peopleManager.setNewPersonVenmoId}
            onAdd={peopleManager.addPerson}
            onAddFromFriend={peopleManager.addFromFriend}
            onRemove={peopleManager.removePerson}
            onUpdate={peopleManager.updatePerson}
            onSaveAsFriend={peopleManager.savePersonAsFriend}
            setPeople={setPeople}
          >
            <div className="flex items-center justify-center gap-1.5 text-sm text-muted-foreground pt-4 mb-2">
              <span>Paid by</span>
              <Select value={paidById || user?.uid} onValueChange={setPaidById}>
                <SelectTrigger className="h-7 px-2 py-0 border rounded hover:bg-muted font-semibold text-foreground w-auto min-w-[3rem] shadow-sm [&>svg]:hidden">
                  <SelectValue placeholder="you" />
                </SelectTrigger>
                <SelectContent>
                  {people.map((person: Person) => {
                    const isMe = person.id === user?.uid || (person as any).userId === user?.uid || person.id === `user-${user?.uid}`;
                    const optionValue = isMe && user ? user.uid : person.id;
                    
                    return (
                      <SelectItem key={person.id} value={optionValue}>
                        {isMe ? 'you' : person.name.split(' ')[0]}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
              <span>and split</span>
              <button className="h-7 px-2 py-0 border rounded hover:bg-muted font-semibold text-foreground shadow-sm">
                equally
              </button>
            </div>
          </PeopleManager>
        </div>
      </Card>
      
      {people.length === 1 && (
         <div className="text-center text-sm text-amber-600 bg-amber-50 p-3 rounded-md mt-4">
           You need at least one other person to split an expense.
         </div>
      )}
    </div>
  );
}
