import { Check, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { TableCell } from '@/components/ui/table';
import { FORM_LABELS, UI_TEXT } from '@/utils/uiConstants';

interface ItemFormFieldsProps {
  mode: 'add' | 'edit';
  itemName: string;
  itemPrice: string;
  onNameChange: (name: string) => void;
  onPriceChange: (price: string) => void;
  onSave: () => void;
  onCancel: () => void;
  layout?: 'card' | 'table';
  hasPeople?: boolean;
}

/**
 * Reusable form fields for adding/editing bill items
 * Used by both BillItemCard and BillItemsTable
 */
export function ItemFormFields({
  mode,
  itemName,
  itemPrice,
  onNameChange,
  onPriceChange,
  onSave,
  onCancel,
  layout = 'card',
  hasPeople = false,
}: ItemFormFieldsProps) {
  const handleKeyPress = (e: React.KeyboardEvent, canSubmit: boolean) => {
    if (e.key === 'Enter' && canSubmit) {
      onSave();
    }
  };

  const canSubmit = itemName.trim() && itemPrice.trim();

  // Table layout - renders as table cells
  // Column order: Item | Price | Assigned To (if hasPeople) | Actions
  if (layout === 'table') {
    return (
      <>
        <TableCell>
          <Input
            placeholder={FORM_LABELS.ENTER_ITEM_NAME}
            value={itemName}
            onChange={(e) => onNameChange(e.target.value)}
            onKeyPress={(e) => handleKeyPress(e, !!canSubmit)}
            className="h-8"
          />
        </TableCell>
        <TableCell className="text-right">
          <div className="relative ml-auto w-24">
            <span className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">
              $
            </span>
            <Input
              type="number"
              inputMode="decimal"
              placeholder={FORM_LABELS.PRICE_PLACEHOLDER}
              value={itemPrice}
              onChange={(e) => onPriceChange(e.target.value)}
              onKeyPress={(e) => handleKeyPress(e, !!canSubmit)}
              className="h-8 text-right pl-5"
              step="0.01"
              min="0"
            />
          </div>
        </TableCell>
        {hasPeople && <TableCell></TableCell>}
        <TableCell>
          <div className="flex gap-1">
            <Button
              size="sm"
              variant={mode === 'edit' ? 'ghost' : 'success'}
              onClick={onSave}
            >
              <Check className={`w-4 h-4 ${mode === 'edit' ? 'text-success' : ''}`} />
            </Button>
            <Button
              size="sm"
              variant={mode === 'edit' ? 'ghost' : 'outline'}
              onClick={onCancel}
            >
              <X className={`w-4 h-4 ${mode === 'edit' ? 'text-muted-foreground' : ''}`} />
            </Button>
          </div>
        </TableCell>
      </>
    );
  }

  // Card layout - renders as compact inline form on mobile
  return (
    <div className="space-y-2">
      {/* Inline fields on mobile, stacked on desktop */}
      <div className="flex gap-2 md:flex-col md:gap-3">
        <div className="flex-1">
          <label className="hidden md:block text-sm font-medium text-muted-foreground mb-1">
            {FORM_LABELS.ITEM_NAME}
          </label>
          <Input
            placeholder={mode === 'edit' ? 'Item name' : FORM_LABELS.ENTER_ITEM_NAME}
            value={itemName}
            onChange={(e) => onNameChange(e.target.value)}
            onKeyPress={(e) => handleKeyPress(e, !!canSubmit)}
            className="text-sm h-9"
          />
        </div>
        <div className="w-24 md:w-full">
          <label className="hidden md:block text-sm font-medium text-muted-foreground mb-1">
            {FORM_LABELS.PRICE}
          </label>
          <div className="relative">
            <span className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">
              $
            </span>
            <Input
              type="number"
              inputMode="decimal"
              placeholder="0.00"
              value={itemPrice}
              onChange={(e) => onPriceChange(e.target.value)}
              onKeyPress={(e) => handleKeyPress(e, !!canSubmit)}
              className="text-sm h-9 text-right pl-6"
              step="0.01"
              min="0"
            />
          </div>
        </div>
      </div>
      {/* Compact action buttons */}
      <div className="flex gap-1.5">
        <Button variant="success" size="sm" className="flex-1 h-8" onClick={onSave}>
          <Check className="w-3.5 h-3.5 mr-1" />
          {mode === 'add' ? 'Add' : 'Save'}
        </Button>
        <Button variant="outline" size="sm" className="flex-1 h-8" onClick={onCancel}>
          <X className="w-3.5 h-3.5 mr-1" />
          Cancel
        </Button>
      </div>
    </div>
  );
}
