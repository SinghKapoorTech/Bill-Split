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
      amount: personTotal.total,
      note: generateItemDescription(personTotal.personId),
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

  // Helper function to check if a person is the current user
  const isCurrentUser = (pt: PersonTotal): boolean => {
    const person = people.find(p => p.id === pt.personId);
    if (!user) return false;
    if (person?.name === user.displayName) return true;
    if (person?.venmoId && profile?.venmoId && person.venmoId === profile.venmoId) return true;
    return false;
  };

  return (
    <>
      <Card className="p-3 md:p-6">
        <div className="flex items-center gap-2 mb-4">
          <DollarSign className="w-4 h-4 md:w-5 md:h-5 text-primary" />
          <h3 className="text-lg md:text-xl font-semibold">{UI_TEXT.SPLIT_SUMMARY}</h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4">
          {personTotals.map((pt) => (
            <div
              key={pt.personId}
              className={`p-3 md:p-4 bg-secondary/30 rounded-lg border transition-colors ${settledPersonIds.includes(pt.personId) ? 'border-green-500/50 dark:border-green-500/30 bg-green-50/10 dark:bg-green-900/5' : 'border-primary/10'}`}
            >
              <div className="font-semibold text-base md:text-lg mb-2 md:mb-3 flex justify-between items-center">
                <span>{displayNames[pt.personId] || pt.name}</span>
                {settledPersonIds.includes(pt.personId) && (
                  <span className="text-xs font-medium text-green-600 dark:text-green-400 bg-green-500/10 px-2 py-0.5 rounded flex items-center gap-1">
                    <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M20 6 9 17l-5-5" />
                    </svg>
                    Settled
                  </span>
                )}
              </div>
              <div className="space-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Items:</span>
                  <span>${pt.itemsSubtotal.toFixed(2)}</span>
                </div>
                {pt.tax > 0 && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Tax:</span>
                    <span>${pt.tax.toFixed(2)}</span>
                  </div>
                )}
                {pt.tip > 0 && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground font-semibold">Tip:</span>
                    <span className="font-semibold">${pt.tip.toFixed(2)}</span>
                  </div>
                )}
                <div className="flex justify-between font-bold text-base border-t pt-2 mt-2">
                  <span>Total:</span>
                  <span className="text-primary">${pt.total.toFixed(2)}</span>
                </div>
              </div>

              {user && (() => {
                const person = people.find(p => p.id === pt.personId);
                const isSettled = settledPersonIds.includes(pt.personId);
                const isMe = isCurrentUser(pt);
                const creditorId = paidById || ownerId;
                const didIPay = creditorId && creditorId === user.uid;
                const didTheyPay = creditorId && (creditorId === pt.personId || creditorId === (person as any)?.userId);
                
                let showVenmoButton = false;
                let venmoType: 'charge' | 'pay' = 'charge';
                
                if (didIPay && !isMe) {
                  showVenmoButton = true;
                  venmoType = 'charge';
                } else if (!didIPay && didTheyPay && !isMe) {
                  showVenmoButton = true;
                  venmoType = 'pay';
                }

                return (
                  <div className="mt-3 space-y-2">
                    {!isSettled && showVenmoButton && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full gap-2"
                        onClick={() => handleChargeOnVenmo(pt, person?.venmoId, venmoType)}
                      >
                        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M19.384 4.616c.616.952.933 2.064.933 3.432 0 4.284-3.636 9.816-6.612 13.248H6.864L4.8 4.728l6.12-.576 1.176 13.488c1.44-2.304 3.576-6.144 3.576-8.688 0-1.176-.24-2.064-.696-2.832l4.608-1.504z" />
                        </svg>
                        {venmoType === 'charge' ? UI_TEXT.CHARGE_ON_VENMO : 'Pay on Venmo'}
                      </Button>
                    )}

                    {onMarkAsSettled && (
                      <Button
                        variant={isSettled ? "outline" : "ghost"}
                        size="sm"
                        className={`w-full gap-2 ${isSettled ? 'text-green-600 dark:text-green-400 border-green-500/20 hover:bg-green-500/10 hover:text-green-700' : 'text-muted-foreground hover:text-green-600 hover:bg-green-50 dark:hover:bg-green-500/10'}`}
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
                          <>
                            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M18 6 6 18" />
                              <path d="m6 6 12 12" />
                            </svg>
                            Undo Settled
                          </>
                        ) : (
                          <>
                            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M20 6 9 17l-5-5" />
                            </svg>
                            Mark as Settled
                          </>
                        )}
                      </Button>
                    )}
                  </div>
                );
              })()}
            </div>
          ))}
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
