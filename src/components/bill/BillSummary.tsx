import { BillData } from '@/types';
import { Input } from '@/components/ui/input';

interface Props {
  billData: BillData;
  onUpdate: (updates: Partial<BillData>) => void;
}

export function BillSummary({ billData, onUpdate }: Props) {
  const handleTaxChange = (value: string) => {
    const numValue = parseFloat(value);
    if (!isNaN(numValue) && numValue >= 0) {
      onUpdate({ tax: numValue });
    }
  };

  const handleTipChange = (value: string) => {
    const numValue = parseFloat(value);
    if (!isNaN(numValue) && numValue >= 0) {
      onUpdate({ tip: numValue });
    }
  };

  return (
    <div className="mt-4 md:mt-6 space-y-2 border-t pt-3 md:pt-4">
      <div className="flex justify-between text-sm">
        <span className="text-muted-foreground">Subtotal:</span>
        <span className="font-medium">${(billData.subtotal || 0).toFixed(2)}</span>
      </div>
      <div className="flex justify-between items-center text-sm md:text-base">
        <span className="text-muted-foreground font-semibold">Tax:</span>
        <div className="flex items-center gap-2">
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
            <Input
              type="number"
              inputMode="decimal"
              value={billData.tax || ''}
              onChange={(e) => handleTaxChange(e.target.value)}
              className="w-28 md:w-32 h-9 md:h-10 text-right text-base md:text-sm pl-6"
              step="0.01"
              min="0"
              placeholder="0.00"
            />
          </div>
        </div>
      </div>
      <div className="flex justify-between items-center text-sm md:text-base">
        <span className="text-muted-foreground font-semibold">Tip:</span>
        <div className="flex items-center gap-2">
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
            <Input
              type="number"
              inputMode="decimal"
              value={billData.tip || ''}
              onChange={(e) => handleTipChange(e.target.value)}
              className="w-28 md:w-32 h-9 md:h-10 text-right text-base md:text-sm pl-6"
              step="0.01"
              min="0"
              placeholder="0.00"
            />
          </div>
        </div>
      </div>
      <div className="flex justify-between text-base md:text-lg font-bold border-t pt-2">
        <span>Total:</span>
        <span>${((billData.subtotal || 0) + (billData.tax || 0) + (billData.tip || 0)).toFixed(2)}</span>
      </div>
    </div>
  );
}
