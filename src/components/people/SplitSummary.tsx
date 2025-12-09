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
}

export function SplitSummary({ personTotals, allItemsAssigned, people, billData, itemAssignments, billName = 'ChipMates' }: Props) {
  const { user } = useAuth();
  const { profile } = useUserProfile();
  const { toast } = useToast();
  const [chargeDialogOpen, setChargeDialogOpen] = useState(false);
  const [settingsDialogOpen, setSettingsDialogOpen] = useState(false);
  const [currentCharge, setCurrentCharge] = useState<VenmoCharge | null>(null);

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

  const handleChargeOnVenmo = (personTotal: PersonTotal, personVenmoId?: string) => {
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
              className="p-3 md:p-4 bg-secondary/30 rounded-lg border border-primary/10"
            >
              <div className="font-semibold text-base md:text-lg mb-2 md:mb-3">{displayNames[pt.personId] || pt.name}</div>
              <div className="space-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Items:</span>
                  <span>${pt.itemsSubtotal.toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Tax:</span>
                  <span>${pt.tax.toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground font-semibold">Tip:</span>
                  <span className="font-semibold">${pt.tip.toFixed(2)}</span>
                </div>
                <div className="flex justify-between font-bold text-base border-t pt-2 mt-2">
                  <span>Total:</span>
                  <span className="text-primary">${pt.total.toFixed(2)}</span>
                </div>
              </div>

              {user && !isCurrentUser(pt) && (() => {
                const person = people.find(p => p.id === pt.personId);
                return (
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full mt-3 gap-2"
                    onClick={() => handleChargeOnVenmo(pt, person?.venmoId)}
                  >
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M19.384 4.616c.616.952.933 2.064.933 3.432 0 4.284-3.636 9.816-6.612 13.248H6.864L4.8 4.728l6.12-.576 1.176 13.488c1.44-2.304 3.576-6.144 3.576-8.688 0-1.176-.24-2.064-.696-2.832l4.608-1.504z" />
                    </svg>
                    {UI_TEXT.CHARGE_ON_VENMO}
                  </Button>
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
