import { useState, useMemo } from 'react';
import { DollarSign } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { PersonTotal, VenmoCharge, Person, BillData, ItemAssignment } from '@/types';
import { useAuth } from '@/contexts/AuthContext';
import { useUserProfile } from '@/hooks/useUserProfile';
import { VenmoChargeDialog } from '@/components/venmo/VenmoChargeDialog';
import { ProfileSettings } from '@/components/profile/ProfileSettings';
import { useToast } from '@/hooks/use-toast';
import { UI_TEXT, ERROR_MESSAGES } from '@/utils/uiConstants';
import { getAbbreviatedNames } from '@/utils/nameAbbreviation';

interface Props {
  personTotals: PersonTotal[];
  allItemsAssigned: boolean;
  people: Person[];
  billData: BillData;
  itemAssignments: ItemAssignment;
  billName?: string;
  settledPersonIds?: string[];
  paidById?: string;
  ownerId?: string;
  onMarkAsSettled?: (personId: string, isSettled: boolean) => void;
}

export function SplitSummary({ personTotals, allItemsAssigned, people, billData, itemAssignments, billName = 'Divit', settledPersonIds = [], paidById, ownerId, onMarkAsSettled }: Props) {
  const { user } = useAuth();
  const { profile } = useUserProfile();
  const { toast } = useToast();
  const [chargeDialogOpen, setChargeDialogOpen] = useState(false);
  const [settingsDialogOpen, setSettingsDialogOpen] = useState(false);
  const [currentCharge, setCurrentCharge] = useState<VenmoCharge | null>(null);
  const [isSettling, setIsSettling] = useState<Record<string, boolean>>({});

  // Get abbreviated display names
  const displayNames = useMemo(() => getAbbreviatedNames(people), [people]);

  const generateItemDescription = (personId: string): string => {
    const assignedItems: string[] = [];

    billData.items.forEach(item => {
      const assignedPeople = itemAssignments[item.id] || [];
      if (assignedPeople.includes(personId)) {
        const shareCount = assignedPeople.length;
        if (shareCount > 1) {
          assignedItems.push(`${item.name} (split ${shareCount} ways)`);
        } else {
          assignedItems.push(item.name);
        }
      }
    });

    if (assignedItems.length === 0) {
      return `${billName} - Your share`;
    }

    return `${billName}: ${assignedItems.join(', ')}`;
  };

  // Helper function to check if a person is the current user
  const isCurrentUser = (pt: PersonTotal): boolean => {
    const person = people.find(p => p.id === pt.personId);
    if (!user) return false;
    if (person?.id === user.uid || (person as Person & { userId?: string })?.userId === user.uid || person?.id === `user-${user.uid}`) return true;
    if (person?.name === user.displayName) return true;
    if (person?.venmoId && profile?.venmoId && person.venmoId === profile.venmoId) return true;
    return false;
  };

  const myTotalAmount = personTotals.find(isCurrentUser)?.total || 0;
  const myPersonId = personTotals.find(isCurrentUser)?.personId || '';

  const handleChargeOnVenmo = (personTotal: PersonTotal, personVenmoId?: string, type: 'charge' | 'pay' = 'charge') => {
    if (!user) {
      toast({
        title: UI_TEXT.SIGN_IN_REQUIRED,
        description: ERROR_MESSAGES.SIGN_IN_FOR_VENMO,
        variant: 'destructive',
      });
      return;
    }

    if (!profile?.venmoId) {
      toast({
        title: ERROR_MESSAGES.VENMO_ID_REQUIRED,
        description: ERROR_MESSAGES.VENMO_ID_REQUIRED_DESC,
        variant: 'destructive',
      });
      setSettingsDialogOpen(true);
      return;
    }

    // Always open dialog, even if no Venmo ID (user can enter it)
    const charge: VenmoCharge = {
      recipientId: personVenmoId || '',
      recipientName: personTotal.name,
      amount: type === 'pay' ? myTotalAmount : personTotal.total,
      note: type === 'pay' ? generateItemDescription(myPersonId) : generateItemDescription(personTotal.personId),
      type,
    };

    setCurrentCharge(charge);
    setChargeDialogOpen(true);
  };

  if (!allItemsAssigned) {
    return (
      <Card className="p-6 bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800">
        <p className="text-sm text-amber-800 dark:text-amber-200 text-center">
          {ERROR_MESSAGES.ASSIGN_ALL_ITEMS}
        </p>
      </Card>
    );
  }

  if (personTotals.length === 0) {
    return null;
  }

  return (
    <>
      <Card className="p-3 md:p-6 mb-2">
        <div className="flex items-center gap-2 mb-4">
          <DollarSign className="w-4 h-4 md:w-5 md:h-5 text-primary" />
          <h3 className="text-lg md:text-xl font-semibold">{UI_TEXT.SPLIT_SUMMARY}</h3>
        </div>

        <div className="flex flex-col gap-2.5 divit-fade-in mt-2">
          {personTotals.map((pt, index) => {
            const person = people.find(p => p.id === pt.personId);
            const isSettled = settledPersonIds.includes(pt.personId);
            const isMe = isCurrentUser(pt);
            const creditorId = paidById || ownerId;
            const didIPay = creditorId && (
              creditorId === user?.uid || 
              creditorId === `user-${user?.uid}`
            );

            // We check if the card we are rendering is the creditor.
            // pt.personId almost always has the "user-" prefix for app users, 
            // but creditorId (paidById or ownerId) is usually just the raw Firebase UID.
            const isThisPersonTheCreditor = creditorId && (
              creditorId === pt.personId || 
              `user-${creditorId}` === pt.personId ||
              creditorId === `user-${pt.personId}` ||
              creditorId === (person as Person & { userId?: string })?.userId || 
              creditorId === `user-${(person as Person & { userId?: string })?.userId}`
            );

            let showVenmoButton = false;
            let showSettleButton = false;
            let venmoType: 'charge' | 'pay' = 'charge';

            if (didIPay && !isMe) {
              showVenmoButton = true;
              showSettleButton = true; // Only creditors can mark debts as settled
              venmoType = 'charge';
            } else if (!didIPay && isThisPersonTheCreditor && !isMe) {
              showVenmoButton = true;
              showSettleButton = false; // Debtors CANNOT mark debts as settled
              venmoType = 'pay';
            }

            const isLast = index === personTotals.length - 1;

            return (
              <PersonCompactRow
                key={pt.personId}
                pt={pt}
                person={person}
                displayName={displayNames[pt.personId] || pt.name}
                isSettled={isSettled}
                showVenmoButton={showVenmoButton}
                showSettleButton={showSettleButton}
                venmoType={venmoType}
                isSettling={isSettling}
                handleChargeOnVenmo={handleChargeOnVenmo}
                onMarkAsSettled={onMarkAsSettled}
                setIsSettling={setIsSettling}
                isLast={isLast}
              />
            );
          })}
        </div>
      </Card>

      <VenmoChargeDialog
        charge={currentCharge}
        open={chargeDialogOpen}
        onOpenChange={setChargeDialogOpen}
      />

      <ProfileSettings
        open={settingsDialogOpen}
        onOpenChange={setSettingsDialogOpen}
      />
    </>
  );
}

// Internal component to manage the dense row
function PersonCompactRow({
  pt,
  person,
  displayName,
  isSettled,
  showVenmoButton,
  showSettleButton,
  venmoType,
  isSettling,
  handleChargeOnVenmo,
  onMarkAsSettled,
  setIsSettling,
  isLast
}: {
  pt: PersonTotal;
  person: Person | undefined;
  displayName: string;
  isSettled: boolean;
  showVenmoButton: boolean;
  showSettleButton: boolean;
  venmoType: 'charge' | 'pay';
  isSettling: Record<string, boolean>;
  handleChargeOnVenmo: (personTotal: PersonTotal, personVenmoId?: string, type?: 'charge' | 'pay') => void;
  onMarkAsSettled?: (personId: string, isSettled: boolean) => void;
  setIsSettling: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  isLast: boolean;
}) {

  return (
    <div className={`p-3 bg-card border shadow-sm rounded-xl transition-all ${isSettled ? 'bg-green-500/10 dark:bg-green-500/20 border-green-500/40 dark:border-green-400/30 shadow-green-500/10' : 'border-border'}`}>

      <div className="flex justify-between items-center gap-3">
        {/* Left: Name and Actions */}
        <div className="flex flex-col justify-center gap-1.5 min-w-0">
          <div className="flex items-center gap-2">
            <span className={`font-semibold text-base md:text-lg leading-none truncate ${isSettled ? 'text-green-800 dark:text-green-200' : ''}`}>{displayName}</span>
            {isSettled && (
              <span className="text-[10px] font-bold tracking-wider uppercase text-green-700 dark:text-green-300 bg-green-500/20 px-1.5 py-0.5 rounded-sm shrink-0">
                Settled
              </span>
            )}
          </div>

          {/* Inline Action Badges */}
          {(!isSettled || showSettleButton) && (showVenmoButton || showSettleButton) && (
            <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
              {!isSettled && showVenmoButton && (
                <button
                  className="flex items-center gap-1 bg-[#008CFF]/10 hover:bg-[#008CFF]/20 text-[#008CFF] px-2.5 py-1 rounded-full text-xs font-semibold transition-colors active:scale-95"
                  onClick={() => handleChargeOnVenmo(pt, person?.venmoId, venmoType)}
                >
                  <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M19.384 4.616c.616.952.933 2.064.933 3.432 0 4.284-3.636 9.816-6.612 13.248H6.864L4.8 4.728l6.12-.576 1.176 13.488c1.44-2.304 3.576-6.144 3.576-8.688 0-1.176-.24-2.064-.696-2.832l4.608-1.504z" />
                  </svg>
                  {venmoType === 'charge' ? 'Charge' : 'Pay'}
                </button>
              )}

              {onMarkAsSettled && showSettleButton && (
                <button
                  className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold transition-colors active:scale-95 disabled:opacity-50 disabled:pointer-events-none ${isSettled ? 'bg-green-600/20 text-green-800 dark:text-green-200 hover:bg-green-600/30' : 'bg-primary/10 text-primary hover:bg-primary/20'}`}
                  disabled={isSettling[pt.personId]}
                  onClick={async () => {
                    setIsSettling(prev => ({ ...prev, [pt.personId]: true }));
                    try {
                      await onMarkAsSettled(pt.personId, !isSettled);
                    } finally {
                      setIsSettling(prev => ({ ...prev, [pt.personId]: false }));
                    }
                  }}
                >
                  {isSettled ? (
                    <>Undo Settle</>
                  ) : (
                    <>
                      <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M20 6 9 17l-5-5" />
                      </svg>
                      Settle
                    </>
                  )}
                </button>
              )}
            </div>
          )}
        </div>

        {/* Right: Total Amount */}
        <div className="flex justify-end items-center shrink-0">
          <span className={`font-bold text-lg md:text-xl tabular-nums tracking-tight ${isSettled ? 'text-green-700 dark:text-green-300 line-through' : 'text-foreground'}`}>
            ${pt.total.toFixed(2)}
          </span>
        </div>
      </div>

    </div>
  );
}
