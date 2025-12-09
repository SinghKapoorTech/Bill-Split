import { Check, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Person, BillItem, ItemAssignment } from '@/types';
import { useMemo } from 'react';
import { getAbbreviatedNames } from '@/utils/nameAbbreviation';

interface Props {
  item: BillItem;
  people: Person[];
  itemAssignments: ItemAssignment;
  onAssign: (itemId: string, personId: string, checked: boolean) => void;
  showSplit?: boolean;
}

export function ItemAssignmentDropdown({ item, people, itemAssignments, onAssign, showSplit = false }: Props) {
  const displayNames = useMemo(() => getAbbreviatedNames(people), [people]);

  return (
    <div className="space-y-2">
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" className="w-full justify-between hover:bg-secondary">
            {(itemAssignments[item.id] || []).length === 0
              ? 'Select people...'
              : `${(itemAssignments[item.id] || []).length} selected`}
            <ChevronDown className="ml-2 h-4 w-4 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-64 p-0">
          <div className="p-2 space-y-1">
            {people.map((person) => {
              const isAssigned = (itemAssignments[item.id] || []).includes(person.id);
              return (
                <div
                  key={person.id}
                  className={`flex items-center space-x-3 px-3 py-2.5 rounded-md cursor-pointer transition-all ${isAssigned
                      ? 'bg-primary/10 hover:bg-primary/20'
                      : 'hover:bg-secondary'
                    }`}
                  onClick={() => onAssign(item.id, person.id, !isAssigned)}
                >
                  <div
                    className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-all ${isAssigned
                        ? 'bg-primary border-primary'
                        : 'border-input'
                      }`}
                  >
                    {isAssigned && <Check className="w-3 h-3 text-primary-foreground" />}
                  </div>
                  <span className="text-sm font-medium flex-1">
                    {displayNames[person.id] || person.name}
                  </span>
                </div>
              );
            })}
          </div>
        </PopoverContent>
      </Popover>
      {showSplit && (itemAssignments[item.id] || []).length > 0 && (
        <div className="text-xs text-muted-foreground space-y-0.5">
          {people.filter(p => (itemAssignments[item.id] || []).includes(p.id)).map((person) => {
            const splitAmount = item.price / (itemAssignments[item.id] || []).length;
            return (
              <p key={person.id}>
                {displayNames[person.id] || person.name}: ${splitAmount.toFixed(2)}
              </p>
            );
          })}
        </div>
      )}
    </div>
  );
}
