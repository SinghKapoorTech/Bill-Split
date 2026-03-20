import { useState, useEffect, useRef, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { GuestClaimView } from '@/components/guest/GuestClaimView';

import { CollaborativeBadge } from '@/components/share/CollaborativeBadge';
import { useBillSplitter } from '@/hooks/useBillSplitter';
import { usePeopleManager } from '@/hooks/usePeopleManager';
import { useBillSession } from '@/hooks/useBillSession';
import { Loader2, AlertCircle, ArrowLeft } from 'lucide-react';
import { Person, BillData, ItemAssignment, Bill } from '@/types';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { ensureUserInPeople } from '@/utils/billCalculations';
import { useAuth } from '@/contexts/AuthContext';
import { useUserProfile } from '@/hooks/useUserProfile';

export default function CollaborativeSessionView() {
  const navigate = useNavigate();
  const { sessionId } = useParams<{ sessionId: string }>();
  const { user } = useAuth();
  const { profile } = useUserProfile();

  // Collaborative session hook with real-time updates
  const { session, isLoading, error, updateSession, toggleAssignment } = useBillSession(sessionId || null);

  // Local state synced with collaborative session
  const [people, setPeople] = useState<Person[]>([]);
  const [billData, setBillData] = useState<BillData | null>(null);
  const [itemAssignments, setItemAssignments] = useState<ItemAssignment>({});

  const [splitEvenly, setSplitEvenly] = useState<boolean>(false);

  const updateSessionRef = useRef<((updates: Partial<Bill>) => Promise<void>) | null>(null);

  const peopleManager = usePeopleManager(people, setPeople);
  const bill = useBillSplitter({
    people,
    billData,
    setBillData,
    itemAssignments,
    setItemAssignments,

    splitEvenly,
    setSplitEvenly,
  });

  // Sync local state with collaborative session
  useEffect(() => {
    if (session) {
      setBillData(session.billData || null);
      setItemAssignments(session.itemAssignments || {});
      const isOwner = user && session.ownerId === user.uid;
      setPeople(isOwner ? ensureUserInPeople(session.people || [], user, profile) : (session.people || []));
      setSplitEvenly(session.splitEvenly || false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  useEffect(() => { updateSessionRef.current = updateSession; }, [updateSession]);

  // Handlers for GuestClaimView
  const handleAddSelfToPeople = (newPerson: Person) => {
    const updatedPeople = [...people, newPerson];
    setPeople(updatedPeople);
    updateSessionRef.current?.({ people: updatedPeople });
  };

  const handleClaimItem = (itemId: string, personId: string, claimed: boolean) => {
    bill.handleItemAssignment(itemId, personId, claimed);

    if (splitEvenly) {
      setSplitEvenly(false);
      updateSessionRef.current?.({ splitEvenly: false });
    }

    toggleAssignment(itemId, personId, claimed);
  };

  const handleRemovePerson = (personId: string) => {
    peopleManager.removePerson(personId);
    bill.removePersonFromAssignments(personId);
    const updatedPeople = people.filter(p => p.id !== personId);
    updateSessionRef.current?.({ people: updatedPeople });
  };

  const handleUpdatePerson = async (personId: string, updates: Partial<Person>) => {
    const updatedPeople = people.map(p =>
      p.id === personId ? { ...p, ...updates } : p
    );
    setPeople(updatedPeople);

    if (session) {
      const { billService } = await import('@/services/billService');

      if (!user && updates.name && session.shareCode) {
        try {
          await billService.updateGuestName(session.id, session.shareCode, personId, updates.name);
          return;
        } catch (error) {
          console.error("Failed to update guest name", error);
        }
      }

      await billService.updatePersonDetails(session.id, personId, updates);
    }
  };

  if (isLoading) {
    return (
      <div className="flex h-[50vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error || !session) {
    return (
      <div className="container mx-auto px-4 py-8">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            {error || "Session not found or has been deleted."}
          </AlertDescription>
        </Alert>
        <div className="mt-4 text-center">
          <Button onClick={() => navigate('/')} variant="outline">
            Return Home
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-6 max-w-2xl">
      <div className="mb-6 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {user && (
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-muted-foreground"
                onClick={() => navigate('/dashboard')}
              >
                <ArrowLeft className="w-5 h-5" />
              </Button>
            )}
            <h2 className="text-2xl font-bold">
              {session.billData?.restaurantName || (session.isSimpleTransaction && session.billData?.items?.[0]?.name) || 'Divit'}
            </h2>
          </div>
          <CollaborativeBadge memberCount={session.people?.length || 0} />
        </div>
      </div>

      <GuestClaimView
        session={session}
        onAddSelfToPeople={handleAddSelfToPeople}
        onClaimItem={handleClaimItem}
        onUpdatePerson={handleUpdatePerson}
        onRemovePerson={handleRemovePerson}
      />
    </div>
  );
}
