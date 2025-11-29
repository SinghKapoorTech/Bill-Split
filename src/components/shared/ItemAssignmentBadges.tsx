import { Check, ChevronDown } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Person, BillItem, ItemAssignment } from '@/types';
import { useState } from 'react';

interface Props {
  item: BillItem;
  people: Person[];
  itemAssignments: ItemAssignment;
  onAssign: (itemId: string, personId: string, checked: boolean) => void;
  showSplit?: boolean;
}

export function ItemAssignmentBadges({ item, people, itemAssignments, onAssign, showSplit = false }: Props) {
  const [isExpanded, setIsExpanded] = useState(false);
  const hasAssignments = (itemAssignments[item.id] || []).length > 0;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5 md:gap-2">
        {people.map((person) => {
          const isAssigned = (itemAssignments[item.id] || []).includes(person.id);
          return (
            <Badge
              key={person.id}
              variant={isAssigned ? 'default' : 'outline'}
              className={`cursor-pointer px-2 py-1 md:px-3 md:py-1.5 text-xs md:text-sm transition-all hover:scale-105 ${
                isAssigned
                  ? 'bg-primary text-primary-foreground shadow-md'
                  : 'hover:bg-secondary hover:border-primary/50'
              }`}
              onClick={() => onAssign(item.id, person.id, !isAssigned)}
            >
              {person.name}
              {isAssigned && <Check className="w-3 h-3 ml-1.5" />}
            </Badge>
          );
        })}
      </div>
      {showSplit && hasAssignments && (
        <>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsExpanded(!isExpanded)}
            className="h-auto p-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <ChevronDown className={`w-3 h-3 mr-1 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
            {isExpanded ? 'Hide Details' : 'View Details'}
          </Button>
          {isExpanded && (
            <div className="text-xs text-muted-foreground space-y-0.5 pl-2 border-l-2 border-primary/20">
              {people.filter(p => (itemAssignments[item.id] || []).includes(p.id)).map((person) => {
                const splitAmount = item.price / (itemAssignments[item.id] || []).length;
                return (
                  <p key={person.id}>
                    {person.name}: ${splitAmount.toFixed(2)}
                  </p>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
