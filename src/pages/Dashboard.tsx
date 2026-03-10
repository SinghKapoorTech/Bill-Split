import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
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
import DesktopBillCard from '@/components/dashboard/DesktopBillCard';
import { FriendBalancePreviewCard } from '@/components/dashboard/FriendBalancePreviewCard';

export default function Dashboard() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  const [isCreatingBill, setIsCreatingBill] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [billToDelete, setBillToDelete] = useState<{ id: string; receiptFileName?: string; title: string } | null>(null);
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

      // Check if bill is old enough to delete (grace period for active editing)
      const billAge = now - (bill.createdAt?.toMillis?.() || 0);
      const isOldEnough = billAge > GRACE_PERIOD_MS;

      return isEmpty && hasNoReceipt && isOldEnough;
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

  const handleResumeBill = async (billId: string, isSimpleTransaction?: boolean, isAirbnb?: boolean) => {
    await resumeSession(billId);
    if (isSimpleTransaction) {
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
  };

  const handleViewBill = (billId: string, isSimpleTransaction?: boolean, isAirbnb?: boolean) => {
    if (isSimpleTransaction) {
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
    // Hide event bills from Dashboard
    if (bill.billType !== 'private') return false;

    const hasItems = bill.billData?.items && bill.billData.items.length > 0;
    const hasReceipt = !!bill.receiptImageUrl;
    return hasItems || hasReceipt;
  });

  if (isLoadingSessions) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-200px)]">
        <Loader2 className="w-12 h-12 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="container mx-auto px-2 md:px-4 py-2 md:py-4 max-w-7xl">
      {/* Header - added dashboard-header class for mobile CSS targeting */}
      <div className="dashboard-header mb-3 md:mb-4 px-1">
        <h1 className="text-xl md:text-2xl font-semibold tracking-tight text-foreground/90">
          Welcome back{user?.displayName ? `, ${user.displayName.split(' ')[0]}` : ''}
        </h1>
      </div>

      <div className="flex flex-col gap-4 md:gap-6">
        {/* Top Section: Friend Balances */}
        <div>
          <FriendBalancePreviewCard />
        </div>

        {/* Bottom Section: My Bills */}
        <div>
          <div className="flex items-center justify-between mb-1.5 px-2">
            <div>
              <h2 className="text-[11px] font-semibold tracking-wider uppercase text-muted-foreground/80">
                My Bills
              </h2>
            </div>
          </div>

          {allBills.length === 0 ? (
            <Card className="p-2 md:p-3 bg-card border-border/60 shadow-sm rounded-xl mx-1 md:mx-0">
              <div className="flex flex-col md:flex-row items-center justify-between gap-2">
                <div className="text-xs font-medium text-muted-foreground ml-1">No bills yet.</div>
                <div className="flex w-full md:w-auto gap-1.5">
                  <Button
                    variant="outline"
                    className="flex-1 md:flex-none h-8 px-2.5 gap-1.5 bg-primary/5 hover:bg-primary/10 border-primary/20 text-foreground text-[11px]"
                    onClick={handleNewBill}
                  >
                    <ReceiptText className="w-4 h-4 text-primary" />
                    Standard
                  </Button>

                  <Button
                    variant="outline"
                    className="flex-1 md:flex-none h-8 px-2.5 gap-1.5 bg-amber-500/5 hover:bg-amber-500/10 border-amber-500/20 text-foreground text-[11px]"
                    onClick={() => navigate('/transaction/new')}
                  >
                    <Zap className="w-4 h-4 text-amber-500" />
                    Quick
                  </Button>

                  <Button
                    variant="outline"
                    className="flex-1 md:flex-none h-8 px-2.5 gap-1.5 bg-rose-500/5 hover:bg-rose-500/10 border-rose-500/20 text-foreground text-[11px]"
                    onClick={() => navigate('/events')}
                  >
                    <CalendarDays className="w-4 h-4 text-rose-500" />
                    Trip
                  </Button>
                </div>
              </div>
            </Card>
          ) : (
            <>
              <div className="flex flex-col gap-3">
                {/* Mobile List View - extremely compact */}
                <div className="block md:hidden divide-y divide-border/50 rounded-xl mx-1 border border-border/60 bg-card shadow-sm overflow-hidden">
                  {(isExpanded ? allBills : allBills.slice(0, 3)).map((bill) => (
                    <MobileBillCard
                      key={bill.id}
                      bill={bill}
                      isLatest={bill.id === activeSession?.id}
                      onView={(id) => handleViewBill(id, bill.isSimpleTransaction, bill.isAirbnb)}
                      onResume={(id) => handleResumeBill(id, bill.isSimpleTransaction, bill.isAirbnb)}
                      onDelete={handleDeleteBill}
                      isResuming={isResuming}
                      isDeleting={isDeleting}
                      formatDate={formatDate}
                      getBillTitle={getBillTitle}
                      isOwner={bill.ownerId === user?.uid}
                    />
                  ))}
                  {allBills.length > 3 && (
                    <div className="flex justify-center border-t border-border">
                      <Button
                        variant="ghost"
                        className="w-full h-9 text-muted-foreground hover:text-foreground hover:bg-muted/30 rounded-none rounded-b-xl group"
                        onClick={() => setIsExpanded(!isExpanded)}
                      >
                        {isExpanded ? (
                          <div className="flex items-center justify-center w-6 h-6 rounded-full bg-muted/50 group-hover:bg-muted transition-colors">
                            <ChevronUp className="w-3 h-3" />
                          </div>
                        ) : (
                          <div className="flex items-center justify-center w-6 h-6 rounded-full bg-muted/50 group-hover:bg-muted transition-colors">
                            <ChevronDown className="w-3 h-3" />
                          </div>
                        )}
                      </Button>
                    </div>
                  )}
                </div>

                {/* Desktop Grid View - card layout */}
                <div className="hidden md:flex flex-col">
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                    {(isExpanded ? allBills : allBills.slice(0, 3)).map((bill) => (
                      <DesktopBillCard
                        key={bill.id}
                        bill={bill}
                        isLatest={bill.id === activeSession?.id}
                        onView={(id) => handleViewBill(id, bill.isSimpleTransaction, bill.isAirbnb)}
                        onResume={(id) => handleResumeBill(id, bill.isSimpleTransaction, bill.isAirbnb)}
                        onDelete={handleDeleteBill}
                        isResuming={isResuming}
                        isDeleting={isDeleting}
                        formatDate={formatDate}
                        getBillTitle={getBillTitle}
                        isOwner={bill.ownerId === user?.uid}
                      />
                    ))}
                  </div>
                  {allBills.length > 3 && (
                    <div className="mt-3 flex justify-center">
                      <Button
                        variant="outline"
                        className="w-full sm:w-auto h-9 px-6 text-muted-foreground hover:text-foreground border-border/60 bg-background/50 hover:bg-muted/50 rounded-full shadow-sm group text-xs font-medium"
                        onClick={() => setIsExpanded(!isExpanded)}
                      >
                        {isExpanded ? 'Collapse' : 'Show More'}
                        {isExpanded ? (
                          <ChevronUp className="w-3 h-3 ml-1.5 group-hover:-translate-y-0.5 transition-transform" />
                        ) : (
                          <ChevronDown className="w-3 h-3 ml-1.5 group-hover:translate-y-0.5 transition-transform" />
                        )}
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </div>

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
  );
}
