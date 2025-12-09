import { Pencil, Trash2, Plus, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { BillData, Person, ItemAssignment } from '@/types';
import { ItemAssignmentBadges } from '../shared/ItemAssignmentBadges';
import { ItemFormFields } from './ItemFormFields';
import { UI_TEXT, FORM_LABELS } from '@/utils/uiConstants';

interface Props {
  billData: BillData | null;
  people: Person[];
  itemAssignments: ItemAssignment;
  editingItemId: string | null;
  editingName: string;
  editingPrice: string;
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

export function BillItemCard({
  billData,
  people,
  itemAssignments,
  editingItemId,
  editingName,
  editingPrice,
  onEdit,
  onSave,
  onCancel,
  onDelete,
  onAssign,
  setEditingName,
  setEditingPrice,
  isAdding,
  newItemName,
  newItemPrice,
  setNewItemName,
  setNewItemPrice,
  onStartAdding,
  onAddItem,
  onCancelAdding,
  splitEvenly,
  onToggleSplitEvenly,
}: Props) {
  const items = billData?.items || [];

  return (
    <>
      {!isAdding && (
        <div className="mb-2 md:mb-3 flex flex-row md:flex-col gap-2">
          <Button onClick={onStartAdding} variant="success" className="flex-1 md:w-full gap-1 md:gap-2 h-8 md:h-10 text-xs md:text-sm">
            <Plus className="w-3 h-3 md:w-4 md:h-4" />
            {UI_TEXT.ADD_ITEM}
          </Button>
          {people.length > 0 && (
            <Button
              onClick={onToggleSplitEvenly}
              variant={splitEvenly ? "default" : "outline"}
              className="flex-1 md:w-full gap-1 md:gap-2 h-8 md:h-10 text-xs md:text-sm"
            >
              <Users className="w-3 h-3 md:w-4 md:h-4" />
              {UI_TEXT.SPLIT_EVENLY}
            </Button>
          )}
        </div>
      )}

      {isAdding && (
        <Card className="p-3 md:p-4 border-2 border-primary mb-3">
          <ItemFormFields
            mode="add"
            itemName={newItemName}
            itemPrice={newItemPrice}
            onNameChange={setNewItemName}
            onPriceChange={setNewItemPrice}
            onSave={onAddItem}
            onCancel={onCancelAdding}
            layout="card"
          />
        </Card>
      )}

      {items.length === 0 && !isAdding && (
        <Card className="p-8 text-center">
          <p className="text-muted-foreground">
            {UI_TEXT.NO_ITEMS_YET}
          </p>
        </Card>
      )}

      {items.map((item) => {
        const isEditing = editingItemId === item.id;
        const hasAssignments = (itemAssignments[item.id] || []).length > 0;

        return (
          <Card
            key={item.id}
            className={`p-2 md:p-4 space-y-1.5 md:space-y-3 border-2 transition-all duration-300 ${hasAssignments
              ? 'border-primary shadow-lg shadow-primary/20 bg-primary/5'
              : 'border-border'
              }`}
          >
            {isEditing ? (
              <ItemFormFields
                mode="edit"
                itemName={editingName}
                itemPrice={editingPrice}
                onNameChange={setEditingName}
                onPriceChange={setEditingPrice}
                onSave={onSave}
                onCancel={onCancel}
                layout="card"
              />
            ) : (
              <>
                <div className="flex justify-between items-center gap-2">
                  <div className="flex items-baseline gap-2 flex-1 min-w-0">
                    <span className="font-medium text-sm truncate">{item.name}</span>
                    <span className="text-sm font-semibold text-primary shrink-0">${item.price.toFixed(2)}</span>
                  </div>
                  <div className="flex gap-0.5 md:gap-1 shrink-0">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => onEdit(item.id, item.name, item.price)}
                      className="h-7 w-7 md:h-9 md:w-9 p-0"
                    >
                      <Pencil className="w-3.5 h-3.5 md:w-4 md:h-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => onDelete(item.id)}
                      className="h-7 w-7 md:h-9 md:w-9 p-0 text-destructive hover:text-destructive"
                    >
                      <Trash2 className="w-3.5 h-3.5 md:w-4 md:h-4" />
                    </Button>
                  </div>
                </div>

                {people.length > 0 && (
                  <div className="space-y-1 md:space-y-2">
                    <label className="hidden md:block text-sm font-medium text-muted-foreground">{FORM_LABELS.ASSIGN_TO}</label>
                    <ItemAssignmentBadges
                      item={item}
                      people={people}
                      itemAssignments={itemAssignments}
                      onAssign={onAssign}
                      showSplit={true}
                    />
                  </div>
                )}
              </>
            )}
          </Card>
        );
      })}
    </>
  );
}
