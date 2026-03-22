import { Person, BillItem, ItemAssignment } from '@/types';

interface Props {
  item: BillItem;
  people: Person[];
  itemAssignments: ItemAssignment;
  onAssignAll: (itemId: string) => void;
}

export function AssignAllButton({ item, people, itemAssignments, onAssignAll }: Props) {
  if (people.length <= 1) return null;

  const assigned = itemAssignments[item.id] || [];
  const allAssigned = people.every(p => assigned.includes(p.id));

  return (
    <button
      className={`text-xs px-2.5 py-1 rounded-md border shrink-0 transition-colors font-medium ml-auto ${
        allAssigned
          ? 'bg-primary text-primary-foreground border-primary'
          : 'text-muted-foreground border-border hover:border-primary/50 hover:text-foreground'
      }`}
      onClick={() => onAssignAll(item.id)}
    >
      All
    </button>
  );
}
