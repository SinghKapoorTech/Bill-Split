import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Receipt, Plus, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
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
import { useBillContext } from '@/contexts/BillSessionContext';
import { useAuth } from '@/contexts/AuthContext';
import { useActiveBalances } from '@/hooks/useActiveBalances';
import MobileBillCard from '@/components/dashboard/MobileBillCard';
import { CreateOptionsDialog } from '@/components/layout/CreateOptionsDialog';
import { Bill } from '@/types/bill.types';
import { motion } from 'framer-motion';
import { layout } from '@/lib/styles';

export default function BillsView() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [billToDelete, setBillToDelete] = useState<{ id: string; receiptFileName?: string; title: string } | null>(null);

  const {
    activeSession,
    savedSessions,
    isLoadingSessions,
    isDeleting,
    isResuming,
    deleteSession,
  } = useBillContext();

  const { refreshBalances } = useActiveBalances();

  const allBills = [
    ...(activeSession ? [activeSession] : []),
    ...savedSessions,
  ].filter(bill => {
    const hasItems = bill.billData?.items && bill.billData.items.length > 0;
    const hasReceipt = !!bill.receiptImageUrl;
    const hasTitle = !!bill.title && bill.title.trim().length > 0;
    return hasItems || hasReceipt || hasTitle;
  });

  // Silently delete empty stale bills on mount
  useEffect(() => {
    if (!user || isLoadingSessions) return;
    const now = Date.now();
    const GRACE_PERIOD_MS = 2 * 60 * 1000;
    const emptyBills = [
      ...(activeSession ? [activeSession] : []),
      ...savedSessions,
    ].filter(bill => {
      const isEmpty = !bill.billData?.items || bill.billData.items.length === 0;
      const hasNoReceipt = !bill.receiptImageUrl;
      const hasNoTitle = !bill.title || bill.title.trim().length === 0;
      const billAge = now - (bill.createdAt?.toMillis?.() || 0);
      return isEmpty && hasNoReceipt && hasNoTitle && billAge > GRACE_PERIOD_MS;
    });
    emptyBills.forEach(bill => deleteSession(bill.id, bill.receiptFileName));
  }, [user, isLoadingSessions, activeSession, savedSessions, deleteSession]);

  const formatDate = (timestamp: { toDate: () => Date } | null | undefined) => {
    if (!timestamp) return 'Unknown date';
    return timestamp.toDate().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const getBillTitle = (bill: Bill) =>
    bill.title || bill.billData?.restaurantName || formatDate(bill.createdAt);

  const handleNavigateToBill = (billId: string, isSimpleTransaction?: boolean, isAirbnb?: boolean, isOwner = true) => {
    if (!isOwner) navigate(`/shared/${billId}`);
    else if (isSimpleTransaction) navigate(`/transaction/${billId}`);
    else if (isAirbnb) navigate(`/airbnb/${billId}`);
    else navigate(`/bill/${billId}`);
  };

  const handleDeleteBill = (bill: Bill) => {
    setBillToDelete({ id: bill.id, receiptFileName: bill.receiptFileName, title: getBillTitle(bill) });
  };

  const confirmDelete = async () => {
    if (!billToDelete) return;
    await deleteSession(billToDelete.id, billToDelete.receiptFileName);
    setBillToDelete(null);
    refreshBalances();
  };

  if (isLoadingSessions) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-200px)]">
        <Loader2 className="w-12 h-12 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col animate-fade-in container mx-auto px-4 max-w-7xl">
      <div className="flex items-center justify-between pt-8 mb-6 shrink-0">
        <div>
          <h1 className={layout.screen.title}>Your Bills</h1>
          <p className={layout.screen.subtitle}>Manage and track your split bills</p>
        </div>
        <Button
          onClick={() => setCreateDialogOpen(true)}
          size="icon"
          className="rounded-full h-10 w-10 shrink-0"
        >
          <Plus className="w-6 h-6" />
        </Button>
      </div>

      <CreateOptionsDialog open={createDialogOpen} onOpenChange={setCreateDialogOpen} />

      {allBills.length === 0 ? (
        <Card className="p-8 text-center space-y-4">
          <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
            <Receipt className="w-8 h-8 text-primary" />
          </div>
          <h3 className="text-lg font-semibold">No bills yet</h3>
          <p className="text-muted-foreground">
            Create your first bill to start splitting expenses with friends.
          </p>
          <Button onClick={() => setCreateDialogOpen(true)}>Create Bill</Button>
        </Card>
      ) : (
        <div className="flex-1 min-h-0 overflow-y-auto">
          <div className="flex flex-col gap-2 p-1 pb-4">
            {allBills.map((bill, index) => (
              <motion.div
                key={bill.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.25, delay: index * 0.05, ease: [0.4, 0, 0.2, 1] }}
              >
                <MobileBillCard
                  bill={bill}
                  isLatest={bill.id === activeSession?.id}
                  onView={(id) => handleNavigateToBill(id, bill.isSimpleTransaction, bill.isAirbnb, bill.ownerId === user?.uid)}
                  onResume={(id) => handleNavigateToBill(id, bill.isSimpleTransaction, bill.isAirbnb, bill.ownerId === user?.uid)}
                  onDelete={handleDeleteBill}
                  isResuming={isResuming}
                  isDeleting={isDeleting}
                  formatDate={formatDate}
                  getBillTitle={getBillTitle}
                  isOwner={bill.ownerId === user?.uid}
                  currentUserId={user?.uid}
                />
              </motion.div>
            ))}
          </div>
        </div>
      )}

      <AlertDialog open={!!billToDelete} onOpenChange={(open) => !open && setBillToDelete(null)}>
        <AlertDialogContent onCloseAutoFocus={(e) => e.preventDefault()}>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete "{billToDelete?.title}" and all associated data.
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-destructive hover:bg-destructive/90">
              Delete Permanently
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
