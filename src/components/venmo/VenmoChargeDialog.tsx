import { useState, useEffect } from 'react';
import { VenmoCharge } from '@/types';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { openVenmoApp } from '@/utils/venmo';

interface Props {
  charge: VenmoCharge | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function VenmoChargeDialog({ charge, open, onOpenChange }: Props) {
  const [venmoId, setVenmoId] = useState('');
  const [description, setDescription] = useState('');

  useEffect(() => {
    if (charge?.recipientId) {
      setVenmoId(charge.recipientId.replace(/^@+/, ''));
    } else {
      setVenmoId('');
    }

    if (charge?.note) {
      setDescription(charge.note);
    } else {
      setDescription('');
    }
  }, [charge]);

  if (!charge) return null;

  const handleOpenVenmo = () => {

    const updatedCharge = {
      ...charge,
      recipientId: venmoId.replace(/^@+/, '').trim(),
      note: description.trim() || 'Divit',
    };

    openVenmoApp(updatedCharge);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>{charge.type === 'pay' ? 'Pay on Venmo' : 'Charge on Venmo'}</DialogTitle>
          <DialogDescription>
            Review the charge details before opening Venmo
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="rounded-lg border border-border bg-secondary/30 p-4 space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">{charge.type === 'pay' ? 'Paying:' : 'Charging:'}</span>
              <span className="font-semibold">{charge.recipientName}</span>
            </div>

            <div className="space-y-2">
              <Label htmlFor="venmoId">
                Venmo ID <span className="text-xs text-muted-foreground">(without @)</span>
              </Label>
              <Input
                id="venmoId"
                placeholder="Enter their Venmo username"
                value={venmoId}
                onChange={(e) => setVenmoId(e.target.value)}
                className="font-mono"
              />
            </div>

            <div className="flex justify-between items-center border-t pt-3">
              <span className="text-sm text-muted-foreground">Amount:</span>
              <span className="text-2xl font-bold text-primary">
                ${charge.amount.toFixed(2)}
              </span>
            </div>

            <div className="border-t pt-3 space-y-2">
              <Label htmlFor="description">Description</Label>
              <Input
                id="description"
                placeholder="Enter payment description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleOpenVenmo} className="gap-2">
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
              <path d="M19.384 4.616c.616.952.933 2.064.933 3.432 0 4.284-3.636 9.816-6.612 13.248H6.864L4.8 4.728l6.12-.576 1.176 13.488c1.44-2.304 3.576-6.144 3.576-8.688 0-1.176-.24-2.064-.696-2.832l4.608-1.504z"/>
            </svg>
            Open Venmo
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
