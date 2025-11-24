import { Bill } from '@/types/bill.types';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { format } from 'date-fns';
import { Trash, Play, Users, FileText, Loader2 } from 'lucide-react';

interface SessionCardProps {
  session: Bill;
  isProcessing: boolean;
  onResume: () => void;
  onDelete: () => void;
}

export function SessionCard({ session, isProcessing, onResume, onDelete }: SessionCardProps) {
  const sessionDate = session.savedAt ? format(session.savedAt.toDate(), 'MMM d, yyyy - h:mm a') : 'Current';
  const totalAmount = session.billData?.total?.toFixed(2) || '0.00';
  const peopleCount = session.people?.length || 0;

  return (
    <Card className="p-4 flex items-center justify-between">
      <div className="flex flex-col gap-2">
        <p className="font-semibold text-lg">Session from {sessionDate}</p>
        <div className="flex items-center gap-4 text-sm text-muted-foreground">
          <span className="flex items-center gap-1">
            <FileText className="w-4 h-4" />
            ${totalAmount}
          </span>
          <span className="flex items-center gap-1">
            <Users className="w-4 h-4" />
            {peopleCount} {peopleCount === 1 ? 'person' : 'people'}
          </span>
        </div>
      </div>
      <div className="flex gap-2">
        <Button variant="outline" size="sm" onClick={onResume} disabled={isProcessing}>
          {isProcessing ? (
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          ) : (
            <Play className="w-4 h-4 mr-2" />
          )}
          Resume
        </Button>
        <Button variant="destructive" size="sm" onClick={onDelete} disabled={isProcessing}>
          {isProcessing ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Trash className="w-4 h-4" />
          )}
        </Button>
      </div>
    </Card>
  );
}
