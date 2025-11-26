import { BillData, Person, ItemAssignment } from '@/types';
import { useIsMobile } from '@/hooks/use-mobile';
import { BillItemCard } from './BillItemCard';
import { BillItemsTable } from './BillItemsTable';

interface Props {
  billData: BillData | null;
  people: Person[];
  itemAssignments: ItemAssignment;
  editingItemId: string | null;
  editingItemName: string;
  editingItemPrice: string;
  onEdit: (itemId: string, name: string, price: number) => void;
  onSave: () => void;
  onCancel: () => void;
  onDelete: (itemId: string) => void;
  onAssign: (itemId: string, personId: string, checked: boolean) => void;
  setEditingName: (name: string) => void;
  setEditingPrice: (price: string) => void;
  isAdding: boolean;
  newItemName: string;
  newItemPrice: string;
  setNewItemName: (name: string) => void;
  setNewItemPrice: (price: string) => void;
  onStartAdding: () => void;
  onAddItem: () => void;
  onCancelAdding: () => void;
  splitEvenly: boolean;
  onToggleSplitEvenly: () => void;
}

export function BillItems(props: Props) {
  const isMobile = useIsMobile();

  if (isMobile) {
    return (
      <div className="space-y-3">
        <BillItemCard
          billData={props.billData}
          people={props.people}
          itemAssignments={props.itemAssignments}
          editingItemId={props.editingItemId}
          editingName={props.editingItemName}
          editingPrice={props.editingItemPrice}
          onEdit={props.onEdit}
          onSave={props.onSave}
          onCancel={props.onCancel}
          onDelete={props.onDelete}
          onAssign={props.onAssign}
          setEditingName={props.setEditingName}
          setEditingPrice={props.setEditingPrice}
          isAdding={props.isAdding}
          newItemName={props.newItemName}
          newItemPrice={props.newItemPrice}
          setNewItemName={props.setNewItemName}
          setNewItemPrice={props.setNewItemPrice}
          onStartAdding={props.onStartAdding}
          onAddItem={props.onAddItem}
          onCancelAdding={props.onCancelAdding}
          splitEvenly={props.splitEvenly}
          onToggleSplitEvenly={props.onToggleSplitEvenly}
        />
      </div>
    );
  }

  return <BillItemsTable {...props} />;
}
