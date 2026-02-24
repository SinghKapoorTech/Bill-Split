import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Receipt, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '@/config/firebase';
import { HydratedSquad } from '@/types/squad.types';
import { Bill } from '@/types/bill.types';
import { NAVIGATION } from '@/utils/uiConstants';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { billService } from '@/services/billService';
import { getSquadById } from '@/services/squadService';
import MobileBillCard from '@/components/dashboard/MobileBillCard';
import DesktopBillCard from '@/components/dashboard/DesktopBillCard';
import { useBillContext } from '@/contexts/BillSessionContext';

export default function SquadDetailView() {
  const { squadId } = useParams<{ squadId: string }>();
  const navigate = useNavigate();
  const [squad, setSquad] = useState<HydratedSquad | null>(null);
  const [loading, setLoading] = useState(true);
  const [squadBills, setSquadBills] = useState<Bill[]>([]);
  const { user } = useAuth();
  
  // Need to bring in session methods to resume/delete from the list
  const { deleteSession, resumeSession, activeSession, isDeleting, isResuming } = useBillContext();

  useEffect(() => {
    if (!squadId || !user) {
      setLoading(false);
      return;
    }

    // 1. Listen to Squad document
    const unsubscribe = onSnapshot(
      doc(db, 'squads', squadId),
      async (squadDoc) => {
        if (squadDoc.exists()) {
          // It's a Firestore document. We need to hydrate it to get names.
          // Since it's realtime, we could just fetch it via squadService which hydrates it.
          // But squadService.getSquadById is async.
          try {
             // For simplicity, let's just use the service whenever it changes 
             // (onSnapshot provides the trigger that it changed).
             const hydrated = await getSquadById(user.uid, squadId);
             setSquad(hydrated);
          } catch (e) {
             console.error("Failed to hydrate squad", e);
             setSquad(null);
          }
        } else {
          setSquad(null);
        }
        setLoading(false);
      },
      (error) => {
        console.error('Error fetching squad:', error);
        setLoading(false);
      }
    );

    // 2. Fetch bills for this squad
    const fetchBills = async () => {
      try {
        const bills = await billService.getBillsBySquad(squadId);
        setSquadBills(bills);
      } catch (err) {
        console.error('Failed to load squad bills', err);
      }
    };

    fetchBills();

    return () => unsubscribe();
  }, [squadId, user]);

  if (loading) {
    return <div className="text-center py-12 text-muted-foreground">Loading squad...</div>;
  }

  if (!squad) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground mb-4">Squad not found.</p>
        <Button onClick={() => navigate('/squads')}>Back to Squads</Button>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl mb-20">
      <div className="mb-8">
        <Button
          variant="ghost"
          className="mb-4 gap-2"
          onClick={() => navigate('/squads')}
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Squads
        </Button>

        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div className="space-y-1">
            <h1 className="text-3xl font-bold flex items-center gap-2">
              <Users className="w-6 h-6 text-primary" />
              {squad.name}
            </h1>
            {squad.description && (
              <p className="text-lg text-muted-foreground">{squad.description}</p>
            )}
            <p className="text-sm text-muted-foreground">
              {squad.members.length} {squad.members.length === 1 ? 'member' : 'members'}
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold">Squad Bills</h2>
        </div>

        {squadBills.length === 0 ? (
          <Card className="p-12">
            <div className="text-center">
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-muted flex items-center justify-center">
                <Receipt className="w-8 h-8 text-muted-foreground" />
              </div>
              <h3 className="text-lg font-medium mb-2">No bills yet</h3>
              <p className="text-sm text-muted-foreground mb-6">
                Bills attached to this squad will appear here.
              </p>
            </div>
          </Card>
        ) : (
          <>
            {/* Mobile List View */}
            <div className="block md:hidden divide-y divide-border rounded-lg border bg-card">
              {squadBills.map((b) => (
                <MobileBillCard
                  key={b.id}
                  bill={b}
                  isLatest={b.id === activeSession?.id}
                  onView={(id) => navigate(`/bill/${id}`)}
                  onResume={async (id) => {
                    await resumeSession(id);
                    navigate(`/bill/${id}`);
                  }}
                  onDelete={(bill) => {
                     if (window.confirm("Are you sure you want to delete this bill?")) {
                       deleteSession(bill.id, bill.receiptFileName);
                     }
                  }}
                  isResuming={isResuming}
                  isDeleting={isDeleting}
                  formatDate={(timestamp) => {
                     if (!timestamp) return 'Unknown date';
                     const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
                     return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
                  }}
                  getBillTitle={(bill) => bill.title || bill.billData?.restaurantName || 'Untitled Bill'}
                />
              ))}
            </div>

            {/* Desktop Grid View */}
            <div className="hidden md:grid md:grid-cols-2 lg:grid-cols-3 gap-4">
              {squadBills.map((b) => (
                <DesktopBillCard
                  key={b.id}
                  bill={b}
                  isLatest={b.id === activeSession?.id}
                  onView={(id) => navigate(`/bill/${id}`)}
                  onResume={async (id) => {
                    await resumeSession(id);
                    navigate(`/bill/${id}`);
                  }}
                  onDelete={(bill) => {
                     if (window.confirm("Are you sure you want to delete this bill?")) {
                       deleteSession(bill.id, bill.receiptFileName);
                     }
                  }}
                  isResuming={isResuming}
                  isDeleting={isDeleting}
                  formatDate={(timestamp) => {
                     if (!timestamp) return 'Unknown date';
                     const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
                     return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
                  }}
                  getBillTitle={(bill) => bill.title || bill.billData?.restaurantName || 'Untitled Bill'}
                />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
