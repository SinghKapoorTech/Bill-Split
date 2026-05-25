import { useState } from 'react';
import { Repeat, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useRecurringBills } from '@/hooks/useRecurringBills';
import { RecurringBillList } from '@/components/recurring/RecurringBillList';
import { recurringBillService } from '@/services/recurringBillService';
import { RecurringBill } from '@/types/recurring.types';
import { useNavigate } from 'react-router-dom';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

export function RecurringBillsSettingsCard() {
  const { recurringBills, isLoading } = useRecurringBills();
  const navigate = useNavigate();

  const [deleteTarget, setDeleteTarget] = useState<{ id: string; title: string } | null>(null);
  const [pauseTarget, setPauseTarget] = useState<RecurringBill | null>(null);

  const handleTogglePause = async () => {
    if (!pauseTarget) return;
    if (pauseTarget.status === 'active') {
      await recurringBillService.pauseRecurringBill(pauseTarget.id);
    } else {
      await recurringBillService.resumeRecurringBill(pauseTarget.id);
    }
    setPauseTarget(null);
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    await recurringBillService.deleteRecurringBill(deleteTarget.id);
    setDeleteTarget(null);
  };

  // Show active and paused bills; hide completed
  const visibleBills = recurringBills.filter(b => b.status !== 'completed');

  return (
    <Card className="p-4 md:p-6">
      <div className="flex items-center justify-between mb-4 md:mb-6">
        <div className="flex items-center gap-2">
          <Repeat className="w-5 h-5 md:w-6 md:h-6 text-success" />
          <h2 className="text-xl md:text-2xl font-semibold">Recurring Bills</h2>
        </div>
        <Button
          size="icon"
          className="rounded-full h-10 w-10"
          onClick={() => navigate('/recurring/new')}
        >
          <Plus className="w-6 h-6" />
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex items-center gap-3 animate-pulse">
              <div className="w-10 h-10 rounded-full bg-muted" />
              <div className="flex-1 space-y-2">
                <div className="h-4 bg-muted rounded w-1/3" />
                <div className="h-3 bg-muted rounded w-1/2" />
              </div>
            </div>
          ))}
        </div>
      ) : visibleBills.length === 0 ? (
        <div className="py-8 text-center space-y-4">
          <div className="w-16 h-16 rounded-full bg-success/10 flex items-center justify-center mx-auto">
            <Repeat className="w-8 h-8 text-success" />
          </div>
          <h3 className="text-lg font-semibold">No recurring bills</h3>
          <p className="text-muted-foreground">
            Set up a recurring bill to automatically charge people on a schedule.
          </p>
          <Button onClick={() => navigate('/recurring/new')}>Create Recurring Bill</Button>
        </div>
      ) : (
        <RecurringBillList
          bills={visibleBills}
          onDelete={(bill) => setDeleteTarget({ id: bill.id, title: bill.title })}
          onTogglePause={(bill) => setPauseTarget(bill)}
          onEdit={(bill) => navigate(`/recurring/${bill.id}`)}
        />
      )}

      {/* Pause/Resume confirmation */}
      <AlertDialog
        open={!!pauseTarget}
        onOpenChange={(open) => { if (!open) setPauseTarget(null); }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {pauseTarget?.status === 'active' ? 'Pause' : 'Resume'} Recurring Bill
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pauseTarget?.status === 'active'
                ? `Pause "${pauseTarget?.title}"? No new bills will be generated until you resume it.`
                : `Resume "${pauseTarget?.title}"? Bills will start generating again on schedule.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleTogglePause}>
              {pauseTarget?.status === 'active' ? 'Pause' : 'Resume'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete confirmation */}
      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Recurring Bill</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{deleteTarget?.title}"? No new bills will be
              generated. Previously generated bills will not be affected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-destructive hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
