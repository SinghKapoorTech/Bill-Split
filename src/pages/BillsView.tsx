import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Receipt, Plus, Loader2, LayoutList, Clock, CheckCircle2, Repeat } from 'lucide-react';
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
import { useRecurringBills } from '@/hooks/useRecurringBills';
import { recurringBillService } from '@/services/recurringBillService';
import MobileBillCard from '@/components/dashboard/MobileBillCard';
import MobileRecurringBillCard from '@/components/dashboard/MobileRecurringBillCard';
import { CreateOptionsDialog } from '@/components/layout/CreateOptionsDialog';
import { TabSelector } from '@/components/shared/TabSelector';
import { billMatchesFilter, recurringMatchesFilter, BillFilter } from '@/utils/billFilters';
import { Bill } from '@/types/bill.types';
import { RecurringBill } from '@/types/recurring.types';
import { motion } from 'framer-motion';
import { layout } from '@/lib/styles';

const FILTER_STORAGE_KEY = 'billsFilter';

const KNOWN_FILTERS: BillFilter[] = ['all', 'unsettled', 'settled', 'recurring'];

const filterTabs = [
  { id: 'all', label: 'All', icon: LayoutList },
  { id: 'unsettled', label: 'Unsettled', icon: Clock },
  { id: 'settled', label: 'Settled', icon: CheckCircle2 },
  { id: 'recurring', label: 'Recurring', icon: Repeat },
];

interface EmptyStateCardProps {
  icon: typeof Receipt;
  heading: string;
  text: string;
  action?: React.ReactNode;
}

function EmptyStateCard({ icon: Icon, heading, text, action }: EmptyStateCardProps) {
  return (
    <Card className="p-8 text-center space-y-4">
      <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
        <Icon className="w-8 h-8 text-primary" />
      </div>
      <h3 className="text-lg font-semibold">{heading}</h3>
      <p className="text-muted-foreground">{text}</p>
      {action}
    </Card>
  );
}

const UNFILTERED_EMPTY = {
  icon: Receipt,
  heading: 'No bills yet',
  text: 'Create your first bill to start splitting expenses with friends.',
};

export default function BillsView() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [billToDelete, setBillToDelete] = useState<{ id: string; receiptFileName?: string; title: string } | null>(null);
  const [recurringToDelete, setRecurringToDelete] = useState<{ id: string; title: string } | null>(null);

  const [filter, setFilter] = useState<BillFilter>(() => {
    try {
      const stored = sessionStorage.getItem(FILTER_STORAGE_KEY);
      return stored && (KNOWN_FILTERS as string[]).includes(stored) ? (stored as BillFilter) : 'all';
    } catch {
      // sessionStorage can be disabled (e.g. Capacitor webviews) and throw on access.
      return 'all';
    }
  });
  useEffect(() => {
    try {
      sessionStorage.setItem(FILTER_STORAGE_KEY, filter);
    } catch {
      // Storage write failed (disabled/full) — non-critical, ignore.
    }
  }, [filter]);

  const {
    activeSession,
    savedSessions,
    isLoadingSessions,
    isDeleting,
    isResuming,
    deleteSession,
  } = useBillContext();

  const { refreshBalances } = useActiveBalances();
  const { recurringBills, isLoading: isLoadingRecurring } = useRecurringBills();

  const allBills = [
    ...(activeSession ? [activeSession] : []),
    ...savedSessions,
  ].filter(bill => {
    const hasItems = bill.billData?.items && bill.billData.items.length > 0;
    const hasReceipt = !!bill.receiptImageUrl;
    const hasTitle = !!bill.title && bill.title.trim().length > 0;
    return hasItems || hasReceipt || hasTitle;
  });

  // Recurring-bill templates surface inline alongside regular bills (hide completed).
  const visibleRecurring = recurringBills.filter(b => b.status !== 'completed');

  // Merge bills and recurring templates into one list, sorted by most-recently updated.
  type FeedItem =
    | { kind: 'bill'; data: Bill; sortKey: number }
    | { kind: 'recurring'; data: RecurringBill; sortKey: number };
  const feed: FeedItem[] = [
    ...allBills.map((b): FeedItem => ({ kind: 'bill', data: b, sortKey: b.updatedAt?.toMillis?.() ?? 0 })),
    ...visibleRecurring.map((r): FeedItem => ({ kind: 'recurring', data: r, sortKey: r.updatedAt?.toMillis?.() ?? 0 })),
  ].sort((a, b) => b.sortKey - a.sortKey);

  const filteredFeed = feed.filter(item =>
    item.kind === 'bill'
      ? billMatchesFilter(filter, item.data, user?.uid)
      : recurringMatchesFilter(filter)
  );

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

  const confirmDeleteRecurring = async () => {
    if (!recurringToDelete) return;
    await recurringBillService.deleteRecurringBill(recurringToDelete.id);
    setRecurringToDelete(null);
  };

  if (isLoadingSessions) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-200px)]">
        <Loader2 className="w-12 h-12 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col animate-fade-in max-w-7xl mx-auto">
      <div className="flex items-center justify-between pt-5 mb-3 shrink-0 px-1">
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

      {feed.length > 0 && (
        <div className="shrink-0 mb-3 px-1 overflow-x-auto scrollbar-hide">
          <TabSelector
            tabs={filterTabs}
            activeTab={filter}
            onTabChange={(id) => setFilter(id as BillFilter)}
          />
        </div>
      )}

      {feed.length === 0 ? (
        isLoadingRecurring ? (
          <div className="flex items-center justify-center flex-1 min-h-0">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : (
          <EmptyStateCard
            {...UNFILTERED_EMPTY}
            action={<Button onClick={() => setCreateDialogOpen(true)}>Create Bill</Button>}
          />
        )
      ) : filteredFeed.length === 0 ? (
        (() => {
          const emptyCopy: Record<Exclude<BillFilter, 'all'>, { heading: string; text: string; icon: typeof Receipt }> = {
            unsettled: { heading: 'All settled up 🎉', text: 'Nobody owes you right now.', icon: CheckCircle2 },
            settled: { heading: 'Nothing settled yet', text: 'Settled bills will show up here.', icon: CheckCircle2 },
            recurring: { heading: 'No recurring bills', text: 'Recurring bill templates will show up here.', icon: Repeat },
          };
          // `filter` is never 'all' here (an 'all'-empty feed is caught by the feed.length === 0 branch
          // above), but fall back to the unfiltered copy for the unreachable case without re-duplicating.
          const copy = filter === 'all' ? UNFILTERED_EMPTY : emptyCopy[filter];
          return <EmptyStateCard {...copy} />;
        })()
      ) : (
        <div className="flex-1 min-h-0 overflow-y-auto scrollbar-hide px-1">
          <div className="flex flex-col gap-2 p-1 pb-4">
            {filteredFeed.map((item, index) => (
              <motion.div
                key={`${item.kind}-${item.data.id}`}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.25, delay: index * 0.05, ease: [0.4, 0, 0.2, 1] }}
              >
                {item.kind === 'recurring' ? (
                  <MobileRecurringBillCard
                    bill={item.data}
                    onView={(id) => navigate(`/recurring/${id}`)}
                    onDelete={(b) => setRecurringToDelete({ id: b.id, title: b.title })}
                  />
                ) : (
                  <MobileBillCard
                    bill={item.data}
                    isLatest={item.data.id === activeSession?.id}
                    onView={(id) => handleNavigateToBill(id, item.data.isSimpleTransaction, item.data.isAirbnb, item.data.ownerId === user?.uid)}
                    onResume={(id) => handleNavigateToBill(id, item.data.isSimpleTransaction, item.data.isAirbnb, item.data.ownerId === user?.uid)}
                    onDelete={handleDeleteBill}
                    isResuming={isResuming}
                    isDeleting={isDeleting}
                    formatDate={formatDate}
                    getBillTitle={getBillTitle}
                    isOwner={item.data.ownerId === user?.uid}
                    currentUserId={user?.uid}
                  />
                )}
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

      <AlertDialog open={!!recurringToDelete} onOpenChange={(open) => !open && setRecurringToDelete(null)}>
        <AlertDialogContent onCloseAutoFocus={(e) => e.preventDefault()}>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Recurring Bill</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{recurringToDelete?.title}"? No new bills will be
              generated. Previously generated bills will not be affected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDeleteRecurring} className="bg-destructive hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
