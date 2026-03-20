import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useBillContext } from '@/contexts/BillSessionContext';
import { useAuth } from '@/contexts/AuthContext';
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
import {
  Plus,
  Receipt,
  Loader2,
  ReceiptText,
  CalendarDays,
  Zap,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { Bill } from '@/types/bill.types';
import { billService } from '@/services/billService';
import { useToast } from '@/hooks/use-toast';
import MobileBillCard from '@/components/dashboard/MobileBillCard';
import { FriendBalancePreviewCard } from '@/components/dashboard/FriendBalancePreviewCard';
import { useActiveBalances } from '@/hooks/useActiveBalances';
import { PullToRefresh } from '@/components/layout/PullToRefresh';
import { Separator } from '@/components/ui/separator';

export default function Dashboard() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const { toast } = useToast();
  const [isCreatingBill, setIsCreatingBill] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [isManualRefreshing, setIsManualRefreshing] = useState(false);
  const [billToDelete, setBillToDelete] = useState<{ id: string; receiptFileName?: string; title: string } | null>(null);
  const { balances, isLoading: isLoadingBalances, refreshBalances } = useActiveBalances();
  const {
    activeSession,
    savedSessions,
    isLoadingSessions,
    isDeleting,
    isResuming,
    archiveAndStartNewSession,
    deleteSession,
    resumeSession
  } = useBillContext();

  // Refresh balances automatically when routing back to the dashboard, 
  // e.g. after finishing a simple transaction wizard.
  useEffect(() => {
    refreshBalances();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.key]);

  const handleRefresh = async () => {
    setIsManualRefreshing(true);
    try {
      // Add a slight artificial delay (min 600ms) to ensure the user clearly sees 
      // the whole screen refresh taking place. Let both the fetch and delay finish.
      await Promise.all([
        refreshBalances(),
        new Promise(resolve => setTimeout(resolve, 600))
      ]);
    } finally {
      setIsManualRefreshing(false);
    }
  };

  // Cleanup: Auto-delete empty bills on Dashboard mount
  useEffect(() => {
    // Wait for sessions to load and user to be authenticated
    if (!user || isLoadingSessions) return;

    // Find empty bills to delete
    const now = Date.now();
    const GRACE_PERIOD_MS = 2 * 60 * 1000; // 2 minutes grace period

    const emptyBills = [
      ...(activeSession ? [activeSession] : []),
      ...savedSessions
    ].filter(bill => {
      const isEmpty = !bill.billData?.items || bill.billData.items.length === 0;
      const hasNoReceipt = !bill.receiptImageUrl;
      const hasNoTitle = !bill.title || bill.title.trim().length === 0;

      // Check if bill is old enough to delete (grace period for active editing)
      const billAge = now - (bill.createdAt?.toMillis?.() || 0);
      const isOldEnough = billAge > GRACE_PERIOD_MS;

      return isEmpty && hasNoReceipt && hasNoTitle && isOldEnough;
    });

    // Delete them silently (no user notification needed)
    if (emptyBills.length > 0) {
      emptyBills.forEach(bill => {
        deleteSession(bill.id, bill.receiptFileName);
      });
    }
  }, [user, isLoadingSessions, activeSession, savedSessions, deleteSession]);

  const handleNewBill = async () => {
    if (!user) {
      toast({
        title: 'Error',
        description: 'You must be logged in to create a bill',
        variant: 'destructive'
      });
      return;
    }

    setIsCreatingBill(true);
    try {
      // Create a new bill with default empty data
      const defaultBillData = {
        items: [],
        subtotal: 0,
        tax: 0,
        tip: 0,
        total: 0
      };

      const billId = await billService.createBill(
        user.uid,
        user.displayName || 'Anonymous',
        'private',
        defaultBillData,
        []
      );

      // Navigate to the newly created bill
      navigate(`/bill/${billId}`);
    } catch (error: unknown) {
      console.error('Error creating new bill:', error);
      const err = error as { message?: string; code?: string };
      console.error('Error message:', err?.message);
      console.error('Error code:', err?.code);
      toast({
        title: 'Error',
        description: err?.message || 'Failed to create new bill. Please try again.',
        variant: 'destructive'
      });
    } finally {
      setIsCreatingBill(false);
    }
  };

  const handleResumeBill = async (billId: string, isSimpleTransaction?: boolean, isAirbnb?: boolean, isOwner: boolean = true) => {
    await resumeSession(billId);
    if (!isOwner) {
      navigate(`/shared/${billId}`);
    } else if (isSimpleTransaction) {
      navigate(`/transaction/${billId}`);
    } else if (isAirbnb) {
      navigate(`/airbnb/${billId}`);
    } else {
      navigate(`/bill/${billId}`);
    }
  };

  const handleDeleteBill = (bill: Bill) => {
    setBillToDelete({
      id: bill.id,
      receiptFileName: bill.receiptFileName,
      title: getBillTitle(bill)
    });
  };

  const confirmDelete = async () => {
    if (!billToDelete) return;

    await deleteSession(billToDelete.id, billToDelete.receiptFileName);
    setBillToDelete(null);
    
    // Explicitly refresh balances to ensure the UI reflects the change 
    // without requiring a manual refresh or navigation.
    refreshBalances();
  };

  const handleViewBill = (billId: string, isSimpleTransaction?: boolean, isAirbnb?: boolean, isOwner: boolean = true) => {
    if (!isOwner) {
      navigate(`/shared/${billId}`);
    } else if (isSimpleTransaction) {
      navigate(`/transaction/${billId}`);
    } else if (isAirbnb) {
      navigate(`/airbnb/${billId}`);
    } else {
      navigate(`/bill/${billId}`);
    }
  };

  const formatDate = (timestamp: { toDate: () => Date } | null | undefined) => {
    if (!timestamp) return 'Unknown date';
    const date = timestamp.toDate();
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const getBillTitle = (bill: Bill) => {
    // Priority: custom title > restaurant name > date
    return bill.title || bill.billData?.restaurantName || formatDate(bill.createdAt);
  };

  const allBills = [
    ...(activeSession ? [activeSession] : []),
    ...savedSessions
  ].filter(bill => {
    const hasItems = bill.billData?.items && bill.billData.items.length > 0;
    const hasReceipt = !!bill.receiptImageUrl;
    const hasTitle = !!bill.title && bill.title.trim().length > 0;
    return hasItems || hasReceipt || hasTitle;
  });

  const hasActiveBalances = balances.some(b => Math.abs(b.balance || 0) > 0.005);
  const isCompletelyEmpty = allBills.length === 0 && !hasActiveBalances;

  if (isLoadingSessions || (isLoadingBalances && balances.length === 0)) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-200px)]">
        <Loader2 className="w-12 h-12 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <PullToRefresh onRefresh={handleRefresh}>
      <div className="container mx-auto px-4 py-4 md:py-8 max-w-7xl">
        {/* Header - added dashboard-header class for mobile CSS targeting */}
        <div className="dashboard-header mb-4 md:mb-8">
          <h1 className="text-3xl md:text-4xl font-bold mb-2">
            Welcome back{user?.displayName ? `, ${user.displayName.split(' ')[0]}` : ''}
          </h1>
        </div>

        <div className="flex flex-col gap-3 md:gap-6 min-h-[calc(100vh-12rem)]">
          {isCompletelyEmpty ? (
            <div className="flex-1 flex items-center justify-center">
              <Card className="p-4 md:p-6 overflow-hidden w-full max-w-2xl">
                <div className="text-center">
                  <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                    <ReceiptText className="w-6 h-6 text-primary" />
                  </div>
                  <h3 className="font-semibold text-lg mb-1">Make your first bill</h3>
                  <p className="text-sm text-muted-foreground mb-6">Split expenses, record simple transactions, or start a group trip to effortlessly track who owes what.</p>

                  <div className="flex flex-col md:flex-row divide-y md:divide-y-0 md:divide-x divide-border border rounded-lg">
                    <button
                      className="flex-1 p-3 flex items-center justify-center gap-3 hover:bg-primary/5 transition-colors group"
                      onClick={handleNewBill}
                    >
                      <ReceiptText className="w-5 h-5 text-primary" />
                      <div className="text-left">
                        <div className="font-medium text-sm">Standard Bill</div>
                        <div className="text-[10px] text-muted-foreground">Scan receipt</div>
                      </div>
                    </button>

                    <button
                      className="flex-1 p-3 flex items-center justify-center gap-3 hover:bg-blue-500/5 transition-colors group"
                      onClick={() => navigate('/transaction/new')}
                    >
                      <Zap className="w-5 h-5 text-blue-500" />
                      <div className="text-left">
                        <div className="font-medium text-sm">Quick Expense</div>
                        <div className="text-[10px] text-muted-foreground">No items</div>
                      </div>
                    </button>

                    <button
                      className="flex-1 p-3 flex items-center justify-center gap-3 hover:bg-orange-500/5 transition-colors group"
                      onClick={() => navigate('/events')}
                    >
                      <CalendarDays className="w-5 h-5 text-orange-500" />
                      <div className="text-left">
                        <div className="font-medium text-sm">Event / Trip</div>
                        <div className="text-[10px] text-muted-foreground">Group bills</div>
                      </div>
                    </button>
                  </div>
                </div>
              </Card>
            </div>
          ) : (
            <>
              {/* Top Section: Friend Balances */}
            <div className="flex flex-col">
              <FriendBalancePreviewCard isRefreshing={isManualRefreshing} />
            </div>

            {allBills.length > 0 && (
              <div className="px-1 py-2">
                <Separator className="bg-border/60" />
              </div>
            )}

              {/* Bottom Section: My Bills */}
              {(allBills.length > 0) && (
                <div>
                  <div className="flex items-center justify-between mb-1 ml-1">
                    <div>
                      <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
                        My Bills
                      </h2>
                    </div>
                  </div>

                  <div className="flex flex-col gap-4">
                    <div className="flex flex-col gap-2 p-1">
                      {isManualRefreshing ? (
                        <div className="flex justify-center items-center py-8">
                          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                        </div>
                      ) : (
                        allBills.map((bill) => (
                          <MobileBillCard
                            key={bill.id}
                            bill={bill}
                            isLatest={bill.id === activeSession?.id}
                            onView={(id) => handleViewBill(id, bill.isSimpleTransaction, bill.isAirbnb, bill.ownerId === user?.uid)}
                            onResume={(id) => handleResumeBill(id, bill.isSimpleTransaction, bill.isAirbnb, bill.ownerId === user?.uid)}
                            onDelete={handleDeleteBill}
                            isResuming={isResuming}
                            isDeleting={isDeleting}
                            formatDate={formatDate}
                            getBillTitle={getBillTitle}
                            isOwner={bill.ownerId === user?.uid}
                            currentUserId={user?.uid}
                          />
                        ))
                      )}
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>


        {/* Delete Confirmation Dialog */}
        <AlertDialog open={!!billToDelete} onOpenChange={(open) => !open && setBillToDelete(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Are you sure?</AlertDialogTitle>
              <AlertDialogDescription>
                This will permanently delete "{billToDelete?.title}" and all associated data.
                This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={confirmDelete}
                className="bg-destructive hover:bg-destructive/90"
              >
                Delete Permanently
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </PullToRefresh>
  );
}
