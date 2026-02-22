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
} from 'lucide-react';
import { Bill } from '@/types/bill.types';
import { billService } from '@/services/billService';
import { useToast } from '@/hooks/use-toast';
import MobileBillCard from '@/components/dashboard/MobileBillCard';
import DesktopBillCard from '@/components/dashboard/DesktopBillCard';

export default function Dashboard() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  const [isCreatingBill, setIsCreatingBill] = useState(false);
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
      console.log(`Cleaning up ${emptyBills.length} empty bill(s)`);
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
    } catch (error: any) {
      console.error('Error creating new bill:', error);
      console.error('Error message:', error?.message);
      console.error('Error code:', error?.code);
      toast({
        title: 'Error',
        description: error?.message || 'Failed to create new bill. Please try again.',
        variant: 'destructive'
      });
    } finally {
      setIsCreatingBill(false);
    }
  };

  const handleResumeBill = async (billId: string) => {
    await resumeSession(billId);
    navigate(`/bill/${billId}`);
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

  const handleViewBill = (billId: string) => {
    navigate(`/bill/${billId}`);
  };

  const formatDate = (timestamp: any) => {
    if (!timestamp) return 'Unknown date';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
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
    <div className="container mx-auto px-4 py-8 max-w-7xl">
      {/* Header - added dashboard-header class for mobile CSS targeting */}
      <div className="dashboard-header mb-8">
        <h1 className="text-3xl md:text-4xl font-bold mb-2">
          Welcome back{user?.displayName ? `, ${user.displayName.split(' ')[0]}` : ''}
        </h1>
        <p className="text-muted-foreground">
          Manage your bills and split expenses with friends
        </p>
      </div>

      {/* New Bill Button */}
      <div className="mb-8">
        <Button
          onClick={handleNewBill}
          disabled={isCreatingBill}
          size="lg"
          className="gap-2 w-full md:w-auto"
        >
          {isCreatingBill ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              Creating...
            </>
          ) : (
            <>
              <Plus className="w-5 h-5" />
              Create New Bill
            </>
          )}
        </Button>
      </div>

      {/* All Bills Section */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-2xl font-semibold flex items-center gap-2">
              <Receipt className="w-6 h-6" />
              My Bills
            </h2>
            <p className="text-sm text-muted-foreground mt-1">
              Your work is automatically saved as you go
            </p>
          </div>
        </div>

        {allBills.length === 0 ? (
          <Card className="p-12">
            <div className="text-center">
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-muted flex items-center justify-center">
                <Receipt className="w-8 h-8 text-muted-foreground" />
              </div>
              <h3 className="text-lg font-medium mb-2">No bills yet</h3>
              <p className="text-sm text-muted-foreground mb-6">
                Create your first bill to get started
              </p>
              <Button onClick={handleNewBill} className="gap-2">
                <Plus className="w-4 h-4" />
                Create Your First Bill
              </Button>
            </div>
          </Card>
        ) : (
          <>
            {/* Mobile List View - compact, DoorDash-style */}
            <div className="block md:hidden divide-y divide-border rounded-lg border bg-card">
              {allBills.map((bill) => (
                <MobileBillCard
                  key={bill.id}
                  bill={bill}
                  isLatest={bill.id === activeSession?.id}
                  onView={handleViewBill}
                  onResume={handleResumeBill}
                  onDelete={handleDeleteBill}
                  isResuming={isResuming}
                  isDeleting={isDeleting}
                  formatDate={formatDate}
                  getBillTitle={getBillTitle}
                  isOwner={bill.ownerId === user?.uid}
                />
              ))}
            </div>

            {/* Desktop Grid View - card layout */}
            <div className="hidden md:grid md:grid-cols-2 lg:grid-cols-3 gap-4">
              {allBills.map((bill) => (
                <DesktopBillCard
                  key={bill.id}
                  bill={bill}
                  isLatest={bill.id === activeSession?.id}
                  onView={handleViewBill}
                  onResume={handleResumeBill}
                  onDelete={handleDeleteBill}
                  isResuming={isResuming}
                  isDeleting={isDeleting}
                  formatDate={formatDate}
                  getBillTitle={getBillTitle}
                  isOwner={bill.ownerId === user?.uid}
                />
              ))}
            </div>
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
  );
}
