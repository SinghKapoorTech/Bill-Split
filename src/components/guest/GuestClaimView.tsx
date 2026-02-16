import { useState, useMemo, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Check, User, Users, Receipt, Edit2 } from 'lucide-react';
import { Bill, BillItem } from '@/types/bill.types';
import { Person } from '@/types/person.types';
import { useAuth } from '@/contexts/AuthContext';
import { ItemAssignmentBadges } from '@/components/shared/ItemAssignmentBadges';
import { EditPersonDialog } from '@/components/people/EditPersonDialog';

interface GuestClaimViewProps {
  session: Bill;
  onAddSelfToPeople: (person: Person) => void;
  onClaimItem: (itemId: string, personId: string, claimed: boolean) => void;
  onUpdatePerson: (personId: string, updates: Partial<Person>) => Promise<void>;
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
  onUpdatePerson
}: GuestClaimViewProps) {
  const { user } = useAuth();
  
  // Initialize from localStorage if available
  const [guestName, setGuestName] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('preferred-guest-name') || '';
    }
    return '';
  });
  
  // For anonymous users: store their guest ID so we can find them in the people list
  // Use localStorage to persist across page refreshes
  const [guestId, setGuestId] = useState<string | null>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem(`guest-id-${session.id}`) || null;
    }
    return null;
  });

  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);

  // Find if current user is already in people list
  const currentPerson = useMemo(() => {
    if (!session.people) return null;
    
    if (user) {
      // Logged-in user: match by user ID
      return session.people.find(p => p.id === user.uid);
    } else if (guestId) {
      // Anonymous user: match by stored guest ID
      return session.people.find(p => p.id === guestId);
    }
    return null;
  }, [session.people, user, guestId]);

  // Error state for duplicate name
  const [nameError, setNameError] = useState<string | null>(null);

  // Generate a unique ID for anonymous guests
  const generateGuestId = () => `guest-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

  const handleAddSelf = () => {
    const name = user?.displayName || guestName.trim();
    if (!name) return;

    // Check for duplicate name (case-insensitive)
    const existingPerson = session.people?.find(
      p => p.name.toLowerCase() === name.toLowerCase()
    );
    
    if (existingPerson) {
      setNameError(`"${existingPerson.name}" is already on this bill. Please use a different name.`);
      return;
    }

    // Clear any previous error
    setNameError(null);

    const newGuestId = user?.uid || generateGuestId();
    
    const newPerson: Person = {
      id: newGuestId,
      name,
      venmoId: undefined,
    };

    // Store guest ID for anonymous users
    if (!user) {
      setGuestId(newGuestId);
      localStorage.setItem(`guest-id-${session.id}`, newGuestId);
      localStorage.setItem('preferred-guest-name', name);
    }

    onAddSelfToPeople(newPerson);
  };

  const handleUpdateProfile = async (updates: Partial<Person>) => {
    if (!currentPerson) return;
    
    await onUpdatePerson(currentPerson.id, updates);
    
    // Update local storage if name changed
    if (updates.name && !user) {
      localStorage.setItem('preferred-guest-name', updates.name);
    }
  };

  const handleSwitchUser = () => {
    if (window.confirm('Are you sure you want to sign out as this guest? You will lose access to your claimed items unless you rejoin with the same name.')) {
        setGuestId(null);
        localStorage.removeItem(`guest-id-${session.id}`);
        // We keep 'preferred-guest-name' for convenience
    }
  };

  const items = session.billData?.items || [];
  const itemAssignments = session.itemAssignments || {};

  // Fallback: If user not in people list, show "Add Yourself" form
  // (This should rarely happen since JoinSession now adds users to people)
  if (!currentPerson) {
    return (
      <div className="space-y-6">
        <Card className="p-6">
          <div className="text-center space-y-4">
            <div className="w-16 h-16 mx-auto rounded-full bg-primary/10 flex items-center justify-center">
              <User className="w-8 h-8 text-primary" />
            </div>
            <div>
              <h3 className="text-xl font-semibold">Join This Bill</h3>
              <p className="text-muted-foreground text-sm mt-1">
                Add yourself to start claiming items
              </p>
            </div>

            {user ? (
              // Logged-in: show their name and confirm button
              <div className="space-y-3">
                <p className="font-medium">{user.displayName || user.email}</p>
                {nameError && (
                  <p className="text-sm text-destructive">{nameError}</p>
                )}
                <Button onClick={handleAddSelf} className="w-full">
                  <Check className="w-4 h-4 mr-2" />
                  Join as {user.displayName?.split(' ')[0] || 'Me'}
                </Button>
              </div>
            ) : (
              // Anonymous: ask for name
              <div className="space-y-3">
                <Input
                  placeholder="Enter your name"
                  value={guestName}
                  onChange={(e) => {
                    setGuestName(e.target.value);
                    setNameError(null); // Clear error when typing
                  }}
                  onKeyDown={(e) => e.key === 'Enter' && handleAddSelf()}
                  className={`text-center ${nameError ? 'border-destructive' : ''}`}
                />
                {nameError && (
                  <p className="text-sm text-destructive">{nameError}</p>
                )}
                <Button
                  onClick={handleAddSelf}
                  disabled={!guestName.trim()}
                  className="w-full"
                >
                  <Check className="w-4 h-4 mr-2" />
                  Add Myself
                </Button>
              </div>
            )}
          </div>
        </Card>

        {/* Show bill preview (read-only) */}
        {items.length > 0 && (
          <Card className="p-4">
            <h4 className="font-medium mb-3 flex items-center gap-2">
              <Users className="w-4 h-4" />
              Bill Preview ({items.length} items)
            </h4>
            <div className="space-y-2 opacity-60">
              {items.slice(0, 5).map((item) => (
                <div key={item.id} className="flex justify-between text-sm">
                  <span>{item.name}</span>
                  <span>${item.price.toFixed(2)}</span>
                </div>
              ))}
              {items.length > 5 && (
                <p className="text-xs text-muted-foreground">
                  +{items.length - 5} more items...
                </p>
              )}
            </div>
          </Card>
        )}
      </div>
    );
  }

  // User is in people list: show items with badge-style assignment UI
  return (
    <div className="space-y-4">
      {/* User info header */}
      <Card className="p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
              <User className="w-5 h-5 text-primary" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-medium text-lg">{currentPerson.name}</span>
                <Button 
                    variant="ghost" 
                    size="icon" 
                    className="h-6 w-6" 
                    onClick={() => setIsEditDialogOpen(true)}
                >
                    <Edit2 className="w-3 h-3" />
                </Button>
              </div>
              <div className="flex items-center gap-2">
                {currentPerson.venmoId && (
                    <span className="text-xs text-muted-foreground">
                      {currentPerson.venmoId}
                    </span>
                )}
                {!user && (
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
             <span className="text-xl font-bold text-primary">
                ${calculatePersonTotal(items, itemAssignments, currentPerson.id).toFixed(2)}
             </span>
          </div>
        </div>
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

      {/* Summary */}
      <Card className="p-4 bg-primary/5 border-primary/20">
        <div className="flex justify-between items-center">
          <span className="font-medium">Your Total</span>
          <span className="text-xl font-bold text-primary">
            ${calculatePersonTotal(items, itemAssignments, currentPerson.id).toFixed(2)}
          </span>
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          Shared items are split equally among claimers
        </p>
      </Card>
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

