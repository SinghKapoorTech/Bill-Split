import { TripTransaction } from '@/types/trip.types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Edit, Trash2 } from 'lucide-react';

interface Props {
  transaction: TripTransaction;
  currentUserId: string | undefined;
  onEdit: () => void;
  onDelete: () => void;
}

export function TripTransactionCard({ transaction, currentUserId, onEdit, onDelete }: Props) {
  const formattedDate = new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(transaction.createdAt);

  const canModify = currentUserId === transaction.createdBy;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex justify-between items-center">
          <span>Transaction</span>
          <span className="text-sm font-normal text-muted-foreground">
            {formattedDate}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <p className="text-sm text-muted-foreground">Added by</p>
          <p>{transaction.createdBy}</p>
        </div>
        <div>
          <p className="text-sm text-muted-foreground">Total Amount</p>
          <p className="font-bold text-lg">${transaction.billData.total.toFixed(2)}</p>
        </div>
        {canModify && (
          <div className="flex gap-2 justify-end">
            <Button variant="outline" size="sm" onClick={onEdit}>
              <Edit className="w-4 h-4 mr-2" />
              Edit
            </Button>
            <Button variant="destructive" size="sm" onClick={onDelete}>
              <Trash2 className="w-4 h-4 mr-2" />
              Delete
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
