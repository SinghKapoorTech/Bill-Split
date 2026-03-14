import { Person, BillItem, ItemAssignment } from '@/types';

interface Props {
  item: BillItem;
  people: Person[];
  itemAssignments: ItemAssignment;
  onAssign: (itemId: string, personId: string, checked: boolean) => void;
}

export function AssignAllButton({ item, people, itemAssignments, onAssign }: Props) {
  if (people.length <= 1) return null;

  const assigned = itemAssignments[item.id] || [];
  const allAssigned = people.every(p => assigned.includes(p.id));

  return (
    <button
      className={`text-xs px-2.5 py-1 rounded-md border shrink-0 transition-colors font-medium uppercase tracking-wide ${
        allAssigned
          ? 'bg-primary text-primary-foreground border-primary'
          : 'text-muted-foreground border-border hover:border-primary/50 hover:text-foreground'
      }`}
      onClick={() => {
        people.forEach(p => {
          const isAssigned = assigned.includes(p.id);
          if (allAssigned && isAssigned) onAssign(item.id, p.id, false);
          else if (!allAssigned && !isAssigned) onAssign(item.id, p.id, true);
        });
      }}
    >
      All
    </button>
  );
}
