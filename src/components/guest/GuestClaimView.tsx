import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { User, Receipt, Edit2, Loader2, AlertTriangle, CheckCircle2, Undo2 } from 'lucide-react';
import { arrayRemove } from 'firebase/firestore';
import { Bill, BillItem } from '@/types/bill.types';
import { billService } from '@/services/billService';
import { useToast } from '@/hooks/use-toast';
import { Person } from '@/types/person.types';
import { VenmoCharge } from '@/types/person.types';
import { useAuth } from '@/contexts/AuthContext';
import { ItemAssignmentBadges } from '@/components/shared/ItemAssignmentBadges';
import { EditPersonDialog } from '@/components/people/EditPersonDialog';
import { VenmoChargeDialog } from '@/components/venmo/VenmoChargeDialog';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';

interface GuestClaimViewProps {
  session: Bill;
  onAddSelfToPeople: (person: Person) => void;
  onClaimItem: (itemId: string, personId: string, claimed: boolean) => void;
  onUpdatePerson: (personId: string, updates: Partial<Person>) => Promise<void>;
  onRemovePerson: (personId: string) => void;
}

/**
 * Simplified view for guests joining a collaborative session.
 * Uses the same ItemAssignmentBadges UI as the bill screen,
 * but restricts clicking to only the current user's badge.
 */
export function GuestClaimView({
  session,
  onAddSelfToPeople,
  onClaimItem,
  onUpdatePerson,
  onRemovePerson
}: GuestClaimViewProps) {
  const { user } = useAuth();
  const navigate = useNavigate();

  // For anonymous users: store their guest ID so we can find them in the people list
  // Use localStorage to persist across page refreshes
  const [guestId, setGuestId] = useState<string | null>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem(`guest-id-${session.id}`) || null;
    }
    return null;
  });

  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [chargeDialogOpen, setChargeDialogOpen] = useState(false);
  const [currentCharge, setCurrentCharge] = useState<VenmoCharge | null>(null);
  const [showRemoveDialog, setShowRemoveDialog] = useState(false);
  const { toast } = useToast();

  // Find if current user is already in people list
  const currentPerson = useMemo(() => {
    console.log('[GuestClaimView] === Finding current person ===');
    console.log('[GuestClaimView] user:', user ? { uid: user.uid, displayName: user.displayName } : null);
    console.log('[GuestClaimView] guestId:', guestId);
    console.log('[GuestClaimView] session.people:', JSON.stringify(session.people?.map(p => ({ id: p.id, name: p.name })), null, 2));
    console.log('[GuestClaimView] session.participantIds:', session.participantIds);
    console.log('[GuestClaimView] session.members:', JSON.stringify(session.members?.map(m => ({ userId: m.userId, name: m.name })), null, 2));
    console.log('[GuestClaimView] session.ownerId:', session.ownerId);

    if (!session.people) {
      console.log('[GuestClaimView] No session.people — returning null');
      return null;
    }

    if (user) {
      // Logged-in user: match by user ID (checking both raw and prefixed formats)
      const prefixedId = `user-${user.uid}`;
      const byId = session.people.find(p => p.id === user.uid || p.id === prefixedId);
      if (byId) {
        console.log('[GuestClaimView] Matched by ID:', byId);
        return byId;
      }
      console.log('[GuestClaimView] No match by ID (checked uid=%s, prefixed=%s)', user.uid, prefixedId);

      // Fallback: user is a confirmed participant but was added with a person-* ID
      // (e.g. added manually to a quick bill). Match by display name.
      if (user.displayName && session.participantIds?.includes(user.uid)) {
        const byName = session.people.find(p =>
          p.name.toLowerCase() === user.displayName!.toLowerCase()
        );
        if (byName) {
          console.log('[GuestClaimView] Matched by name (participantIds fallback):', byName);
          return byName;
        }
        console.log('[GuestClaimView] In participantIds but no name match for displayName=%s', user.displayName);
      } else {
        console.log('[GuestClaimView] Not in participantIds or no displayName. displayName=%s, inParticipants=%s',
          user.displayName, session.participantIds?.includes(user.uid));
      }

      console.log('[GuestClaimView] Returning null for logged-in user');
      return null;
    } else if (guestId) {
      // Anonymous user: match by stored guest ID (checking both raw and prefixed formats)
      const match = session.people.find(p => p.id === guestId || p.id === `user-${guestId}`);
      console.log('[GuestClaimView] Anonymous match:', match);
      return match;
    }
    console.log('[GuestClaimView] No user and no guestId — returning null');
    return null;
  }, [session.people, user, guestId]);

  const handleUpdateProfile = async (updates: Partial<Person>) => {
    if (!currentPerson) return;

    await onUpdatePerson(currentPerson.id, updates);

    // Update local storage if name changed
    if (updates.name && !user) {
      localStorage.setItem('preferred-guest-name', updates.name);
    }
  };

  const handleSwitchUser = () => {
    setShowRemoveDialog(true);
  };

  const handleConfirmRemove = async () => {
    if (!currentPerson) return;

    if (!user && session.shareCode) {
      try {
        const { billService } = await import('@/services/billService');
        await billService.leaveBillAsGuest(session.id, session.shareCode, currentPerson.id);
      } catch (e) {
        console.error("Failed to delete guest shadow user", e);
      }
    }

    onRemovePerson(currentPerson.id);
    setGuestId(null);
    localStorage.removeItem(`guest-id-${session.id}`);
    setShowRemoveDialog(false);
    // Redirect to join page so they can re-enter their name
    navigate(`/join/${session.id}${session.shareCode ? `?code=${session.shareCode}` : ''}`, { replace: true });
  };

  // Find the person who paid for the bill
  const payerPerson = useMemo(() => {
    const creditorId = session.paidById || session.ownerId;
    if (!creditorId || !session.people) return null;
    return session.people.find(
      p => p.id === creditorId || p.id === `user-${creditorId}` || `user-${p.id}` === creditorId
    ) || null;
  }, [session.paidById, session.ownerId, session.people]);

  const handlePayOnVenmo = () => {
    if (!currentPerson || !payerPerson) return;
    const total = calculatePersonTotal(
      session.billData?.items || [],
      session.itemAssignments || {},
      currentPerson.id
    );
    if (total <= 0) return;

    // Build itemized description
    const assignedItems: string[] = [];
    (session.billData?.items || []).forEach(item => {
      const assignedPeople = (session.itemAssignments || {})[item.id] || [];
      if (assignedPeople.includes(currentPerson.id)) {
        const shareCount = assignedPeople.length;
        if (shareCount > 1) {
          assignedItems.push(`${item.name} (split ${shareCount} ways)`);
        } else {
          assignedItems.push(item.name);
        }
      }
    });

    const restaurantName = session.billData?.restaurantName || (session.isSimpleTransaction && session.billData?.items?.[0]?.name) || 'Divit';
    const note = assignedItems.length > 0
      ? `${restaurantName}: ${assignedItems.join(', ')}`
      : `${restaurantName} - Your share`;

    const charge: VenmoCharge = {
      recipientId: payerPerson.venmoId || '',
      recipientName: payerPerson.name,
      amount: total,
      note,
      type: 'pay',
    };

    setCurrentCharge(charge);
    setChargeDialogOpen(true);
  };

  const items = session.billData?.items || [];
  const itemAssignments = session.itemAssignments || {};

  if (!currentPerson) {
    return (
      <div className="flex flex-col items-center justify-center py-12 space-y-4">
        <AlertTriangle className="w-8 h-8 text-destructive" />
        <p className="text-muted-foreground">
          We couldn't find your profile on this bill.
        </p>
        <Button variant="outline" onClick={() => navigate('/dashboard')}>
          Back to Dashboard
        </Button>
      </div>
    );
  }

  const isSettled = (session.settledPersonIds || []).includes(currentPerson.id);

  const handleUndoSettle = async () => {
    if (!currentPerson) return;
    try {
      await billService.updateBill(session.id, {
        settledPersonIds: arrayRemove(currentPerson.id) as unknown as string[]
      });
      toast({
        title: "Undo Settled",
        description: "Your balance has been restored for this bill.",
      });
    } catch (error) {
      console.error("Failed to undo settle", error);
      toast({
        title: "Error",
        description: "Failed to undo settle. Please try again.",
        variant: "destructive"
      });
    }
  };

  // User is in people list: show items with badge-style assignment UI
  return (
    <div className="space-y-4">
      {/* User info header with total and pay button */}
      <Card className={`p-4 ${isSettled ? 'bg-green-500/10 dark:bg-green-500/20 border-green-500/40 dark:border-green-400/30' : ''}`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-full flex items-center justify-center ${isSettled ? 'bg-green-500/20' : 'bg-primary/10'}`}>
              {isSettled ? (
                <CheckCircle2 className="w-5 h-5 text-green-600 dark:text-green-400" />
              ) : (
                <User className="w-5 h-5 text-primary" />
              )}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className={`font-medium text-lg ${isSettled ? 'text-green-800 dark:text-green-200' : ''}`}>{currentPerson.name}</span>
                {isSettled && (
                  <span className="text-[10px] font-bold tracking-wider uppercase text-green-700 dark:text-green-300 bg-green-500/20 px-1.5 py-0.5 rounded-sm shrink-0">
                    Settled
                  </span>
                )}
                {!isSettled && (
                  <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      onClick={() => setIsEditDialogOpen(true)}
                  >
                      <Edit2 className="w-3 h-3" />
                  </Button>
                )}
              </div>
              <div className="flex items-center gap-2">
                {currentPerson.venmoId && (
                    <span className="text-xs text-muted-foreground">
                      {currentPerson.venmoId}
                    </span>
                )}
                {!user && !isSettled && (
                    <button
                        onClick={handleSwitchUser}
                        className="text-xs text-muted-foreground underline hover:text-primary ml-1"
                    >
                        Not you?
                    </button>
                )}
              </div>
            </div>
          </div>
          <div className="text-right">
            <span className="text-sm text-muted-foreground block">Total</span>
            <span className={`text-xl font-bold ${isSettled ? 'text-green-600 dark:text-green-400 line-through' : 'text-primary'}`}>
              ${calculatePersonTotal(items, itemAssignments, currentPerson.id).toFixed(2)}
            </span>
          </div>
        </div>

        {/* Undo Settle button - shown when settled */}
        {isSettled && (
          <div className="mt-3 pt-3 border-t border-green-500/20">
            <Button
              onClick={handleUndoSettle}
              variant="outline"
              className="w-full gap-2 border-green-500/40 text-green-700 dark:text-green-300 hover:bg-green-500/10"
              size="sm"
            >
              <Undo2 className="w-4 h-4" />
              Undo Settle
            </Button>
          </div>
        )}

        {/* Pay on Venmo button - hidden when settled */}
        {!isSettled && payerPerson && currentPerson.id !== payerPerson.id && calculatePersonTotal(items, itemAssignments, currentPerson.id) > 0 && (
          <div className="mt-3 pt-3 border-t">
            <Button
              onClick={handlePayOnVenmo}
              className="w-full gap-2"
              size="sm"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                <path d="M19.384 4.616c.616.952.933 2.064.933 3.432 0 4.284-3.636 9.816-6.612 13.248H6.864L4.8 4.728l6.12-.576 1.176 13.488c1.44-2.304 3.576-6.144 3.576-8.688 0-1.176-.24-2.064-.696-2.832l4.608-1.504z" />
              </svg>
              Pay {payerPerson.name.split(' ')[0]} on Venmo
            </Button>
          </div>
        )}
      </Card>

      {/* Edit Person Dialog */}
      <EditPersonDialog
        isOpen={isEditDialogOpen}
        onClose={() => setIsEditDialogOpen(false)}
        person={currentPerson}
        onSave={handleUpdateProfile}
        existingNames={session.people?.map(p => p.name) || []}
      />

      {items.length === 0 ? (
        <Card className="p-8 text-center">
          <p className="text-muted-foreground">
            No items on the bill yet. Wait for the host to add items.
          </p>
        </Card>
      ) : (
        <Card className="p-4">
          <div className="flex items-center gap-2 mb-4">
            <Receipt className="w-5 h-5 text-primary" />
            <h3 className="text-xl font-semibold">Bill Items</h3>
          </div>
          
          <div className="space-y-4">
            {items.map((item) => {
              const assignedTo = itemAssignments[item.id] || [];
              const hasAssignments = assignedTo.length > 0;

              return (
                <div
                  key={item.id}
                  className={`p-3 rounded-lg border-2 transition-all ${
                    hasAssignments
                      ? 'border-primary/30 bg-primary/5'
                      : 'border-border'
                  }`}
                >
                  {/* Item name and price */}
                  <div className="flex justify-between items-center mb-2">
                    <span className="font-medium">{item.name}</span>
                    <span className="text-primary font-semibold">
                      ${item.price.toFixed(2)}
                    </span>
                  </div>

                  {/* Assignment badges - only current user's badge is clickable */}
                  {session.people && session.people.length > 0 && (
                    <ItemAssignmentBadges
                      item={item}
                      people={session.people}
                      itemAssignments={itemAssignments}
                      onAssign={onClaimItem}
                      showSplit={true}
                      restrictToPersonId={currentPerson.id}
                    />
                  )}
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {/* Guest Upsell Card */}
      {!user && currentPerson && (
        <Card className="p-5 mt-8 border-primary/20 bg-gradient-to-br from-primary/5 to-transparent">
          <div className="flex flex-col space-y-3">
            <h3 className="font-semibold text-lg flex items-center gap-2">
              Want to save this bill?
            </h3>
            <p className="text-sm text-muted-foreground">
              Create an account to track balances with friends, settle up with one tap via Venmo, and keep a history of all your receipts.
            </p>
            <Button 
              className="w-full mt-2" 
              onClick={() => {
                // Strip user- prefix to get the raw shadow user doc ID
                const shadowUserId = currentPerson.id.startsWith('user-') ? currentPerson.id.substring(5) : currentPerson.id;
                navigate(`/auth?claimGuestId=${shadowUserId}&returnTo=/shared/${session.id}`);
              }}
            >
              Create Account
            </Button>
          </div>
        </Card>
      )}

      <VenmoChargeDialog
        charge={currentCharge}
        open={chargeDialogOpen}
        onOpenChange={setChargeDialogOpen}
      />

      <Dialog open={showRemoveDialog} onOpenChange={setShowRemoveDialog}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-destructive" />
              Remove yourself?
            </DialogTitle>
            <DialogDescription>
              You will be removed from the bill and any items you claimed will be unassigned. You'll be taken back to the join page to re-enter your name.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setShowRemoveDialog(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleConfirmRemove}>
              Remove Me
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/**
 * Calculate what this person owes based on their claimed items
 * Items are split equally among all people who claimed them
 */
function calculatePersonTotal(
  items: BillItem[],
  itemAssignments: Record<string, string[]>,
  personId: string
): number {
  let total = 0;

  for (const item of items) {
    const assignedTo = itemAssignments[item.id] || [];
    if (assignedTo.includes(personId)) {
      // Split price among all claimers
      total += item.price / assignedTo.length;
    }
  }

  return total;
}

