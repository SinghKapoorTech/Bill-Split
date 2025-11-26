import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useBillContext } from '@/contexts/BillSessionContext';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Plus,
  Receipt,
  Calendar,
  DollarSign,
  Loader2,
  Trash2,
  Play,
  Clock,
  ShoppingBag
} from 'lucide-react';
import { Bill } from '@/types/bill.types';
import { formatCurrency } from '@/utils/format';
import { billService } from '@/services/billService';
import { useToast } from '@/hooks/use-toast';

export default function Dashboard() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  const [isCreatingBill, setIsCreatingBill] = useState(false);
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

  const handleNewBill = async () => {
    console.log('handleNewBill called');
    console.log('User:', user);
    console.log('User UID:', user?.uid);

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
      console.log('Creating new bill...');
      console.log('Active session:', activeSession);

      // If there's already an active session, archive it first
      if (activeSession?.id) {
        console.log('Archiving active session:', activeSession.id);
        await archiveAndStartNewSession();
        console.log('Active session archived');
      }

      // Create a new bill with default empty data
      const defaultBillData = {
        items: [],
        subtotal: 0,
        tax: 0,
        tip: 0,
        total: 0
      };

      console.log('Calling billService.createBill...');
      const billId = await billService.createBill(
        user.uid,
        user.displayName || 'Anonymous',
        'private',
        defaultBillData,
        []
      );

      console.log('Bill created with ID:', billId);

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

  const handleDeleteBill = async (billId: string, receiptFileName?: string) => {
    if (confirm('Are you sure you want to delete this bill? This action cannot be undone.')) {
      await deleteSession(billId, receiptFileName);
    }
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
    return bill.billData?.restaurantName || 'Untitled Bill';
  };

  // Combine active session and saved sessions into one list
  const allBills = [
    ...(activeSession ? [activeSession] : []),
    ...savedSessions
  ];

  if (isLoadingSessions) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-200px)]">
        <Loader2 className="w-12 h-12 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-7xl">
      {/* Header */}
      <div className="mb-8">
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
          className="gap-2 w-full sm:w-auto"
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
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {allBills.map((bill) => {
              const isLatest = bill.id === activeSession?.id;
              return (
              <Card
                key={bill.id}
                className={`hover:shadow-lg transition-all ${
                  isLatest
                    ? 'ring-2 ring-primary bg-primary/5'
                    : ''
                }`}
              >
                <CardHeader className="pb-3">
                  <div className="flex items-start gap-3 mb-2">
                    {bill.receiptImageUrl ? (
                      <img
                        src={bill.receiptImageUrl}
                        alt="Receipt"
                        className="w-12 h-12 object-cover rounded-md"
                      />
                    ) : (
                      <div className="w-12 h-12 bg-muted rounded-md flex items-center justify-center">
                        <Receipt className="w-6 h-6 text-muted-foreground" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <CardTitle className="text-lg truncate">
                          {getBillTitle(bill)}
                        </CardTitle>
                        {isLatest && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-primary text-primary-foreground">
                            Latest
                          </span>
                        )}
                      </div>
                      <CardDescription className="text-xs">
                        {formatDate(bill.savedAt || bill.createdAt)}
                      </CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2 mb-4">
                    <div className="flex items-center justify-between text-sm">
                      <span className="flex items-center gap-1 text-muted-foreground">
                        <DollarSign className="w-3 h-3" />
                        Total
                      </span>
                      <span className="font-semibold">
                        {formatCurrency(bill.billData?.total || 0)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="flex items-center gap-1 text-muted-foreground">
                        <ShoppingBag className="w-3 h-3" />
                        Items
                      </span>
                      <span>{bill.billData?.items?.length || 0}</span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="flex items-center gap-1 text-muted-foreground">
                        <Receipt className="w-3 h-3" />
                        People
                      </span>
                      <span>{bill.people?.length || 0}</span>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    {isLatest ? (
                      <Button
                        onClick={() => handleViewBill(bill.id)}
                        className="flex-1 gap-1"
                        size="sm"
                      >
                        <Play className="w-3 h-3" />
                        Continue
                      </Button>
                    ) : (
                      <Button
                        onClick={() => handleResumeBill(bill.id)}
                        disabled={isResuming}
                        className="flex-1 gap-1"
                        size="sm"
                        variant="outline"
                      >
                        {isResuming ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : (
                          <Play className="w-3 h-3" />
                        )}
                        Resume
                      </Button>
                    )}
                    <Button
                      onClick={() => handleDeleteBill(bill.id, bill.receiptFileName)}
                      disabled={isDeleting}
                      variant="destructive"
                      size="sm"
                      className="gap-1"
                    >
                      {isDeleting ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        <Trash2 className="w-3 h-3" />
                      )}
                    </Button>
                  </div>
                </CardContent>
              </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
