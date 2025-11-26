import { Pencil, Trash2, Plus, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { BillData, Person, ItemAssignment } from '@/types';
import { ItemAssignmentBadges } from '../shared/ItemAssignmentBadges';
import { ItemAssignmentDropdown } from '../shared/ItemAssignmentDropdown';
import { ItemFormFields } from './ItemFormFields';
import { UI_TEXT, FORM_LABELS } from '@/utils/uiConstants';

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

export function BillItemsTable({
  billData,
  people,
  itemAssignments,
  editingItemId,
  editingItemName,
  editingItemPrice,
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
        <div className="mb-4 flex gap-2">
          <Button onClick={onStartAdding} variant="success" className="gap-2">
            <Plus className="w-4 h-4" />
            {UI_TEXT.ADD_ITEM}
          </Button>
          {people.length > 0 && (
            <Button
              onClick={onToggleSplitEvenly}
              variant={splitEvenly ? "default" : "outline"}
              className="gap-2"
            >
              <Users className="w-4 h-4" />
              {UI_TEXT.SPLIT_EVENLY}
            </Button>
          )}
        </div>
      )}

      <div className="rounded-md border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="min-w-[150px]">Item</TableHead>
              <TableHead className="text-right min-w-[80px]">Price</TableHead>
              {people.length > 0 && <TableHead className="min-w-[200px]">Assigned To</TableHead>}
              <TableHead className="w-[100px]">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isAdding && (
              <TableRow className="bg-primary/5">
                <ItemFormFields
                  mode="add"
                  itemName={newItemName}
                  itemPrice={newItemPrice}
                  onNameChange={setNewItemName}
                  onPriceChange={setNewItemPrice}
                  onSave={onAddItem}
                  onCancel={onCancelAdding}
                  layout="table"
                  hasPeople={people.length > 0}
                />
              </TableRow>
            )}

            {items.length === 0 && !isAdding ? (
              <TableRow>
                <TableCell colSpan={people.length > 0 ? 4 : 3} className="text-center py-8 text-muted-foreground">
                  {UI_TEXT.NO_ITEMS_YET}
                </TableCell>
              </TableRow>
            ) : (
              items.map((item) => {
              const hasAssignments = (itemAssignments[item.id] || []).length > 0;
              return (
                <TableRow
                  key={item.id}
                  className={`transition-all duration-300 ${
                    hasAssignments
                      ? 'border-l-4 !border-l-primary bg-primary/5'
                      : 'border-l-4 border-l-transparent'
                  }`}
                >
                  {editingItemId === item.id ? (
                    <ItemFormFields
                      mode="edit"
                      itemName={editingItemName}
                      itemPrice={editingItemPrice}
                      onNameChange={setEditingName}
                      onPriceChange={setEditingPrice}
                      onSave={onSave}
                      onCancel={onCancel}
                      layout="table"
                      hasPeople={people.length > 0}
                    />
                  ) : (
                    <>
                      <TableCell className="font-medium">{item.name}</TableCell>
                      <TableCell className="text-right">${item.price.toFixed(2)}</TableCell>
                        <TableCell>
                          <ItemAssignmentBadges
                            item={item}
                            people={people}
                            itemAssignments={itemAssignments}
                            onAssign={onAssign}
                            showSplit={true}
                          />
                        </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button size="sm" variant="ghost" onClick={() => onEdit(item.id, item.name, item.price)}>
                            <Pencil className="w-4 h-4" />
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => onDelete(item.id)}>
                            <Trash2 className="w-4 h-4 text-destructive" />
                          </Button>
                        </div>
                      </TableCell>
                    </>
                  )}
                </TableRow>
              );
            })
          )}
        </TableBody>
      </Table>
    </div>
    </>
  );
}
