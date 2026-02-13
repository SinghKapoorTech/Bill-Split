import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useUserProfile } from './useUserProfile';
import { Person } from '@/types';
import { useToast } from './use-toast';
import { generatePersonId, generateUserId, ensureUserInPeople } from '@/utils/billCalculations';
import { validatePersonInput } from '@/utils/validation';
import { saveFriendToFirestore, createPersonObject } from '@/utils/firestore';

/**
 * Hook for managing people on a bill
 * Handles adding, removing, and syncing with Firestore friends list
 * @returns People state and management handlers
 */

export function usePeopleManager(
  people: Person[],
  setPeople: React.Dispatch<React.SetStateAction<Person[]>>
) {
  const [newPersonName, setNewPersonName] = useState('');
  const [newPersonVenmoId, setNewPersonVenmoId] = useState('');
  const [useNameAsVenmoId, setUseNameAsVenmoId] = useState(false);
  const { user } = useAuth();
  const { profile } = useUserProfile();
  const { toast } = useToast();

  // Ensure the logged-in user is always in the people list
  useEffect(() => {
    const updatedPeople = ensureUserInPeople(people, user, profile);
    if (updatedPeople !== people) {
      setPeople(updatedPeople);
    }
  }, [user, profile?.venmoId, people.length]);

  const addPerson = async (): Promise<Person | null> => {
    // Validate input
    const validation = validatePersonInput(newPersonName);
    if (!validation.isValid && validation.error) {
      toast({
        title: validation.error.title,
        description: validation.error.description,
        variant: 'destructive',
      });
      return null;
    }

    // Create person object with proper venmoId handling
    const personData = createPersonObject(newPersonName, newPersonVenmoId, useNameAsVenmoId);

    const newPerson: Person = {
      id: generatePersonId(),
      ...personData,
    };

    setPeople([...people, newPerson]);

    // Reset form
    setNewPersonName('');
    setNewPersonVenmoId('');
    setUseNameAsVenmoId(false);

    return newPerson;
  };

  const removePerson = (personId: string) => {
    // Prevent removing the logged-in user
    if (user) {
      const userId = generateUserId(user.uid);
      if (personId === userId) {
        toast({
          title: 'Cannot remove yourself',
          description: 'You are automatically included in every bill.',
          variant: 'destructive',
        });
        return;
      }
    }
    
    setPeople(people.filter(p => p.id !== personId));
  };

  const addFromFriend = (friend: { name: string; venmoId?: string }): Person => {
    const newPerson: Person = {
      id: generatePersonId(),
      name: friend.name,
      venmoId: friend.venmoId,
    };

    setPeople([...people, newPerson]);

    toast({
      title: 'Friend added',
      description: `${friend.name} has been added to the bill.`,
    });

    return newPerson;
  };

  const savePersonAsFriend = async (person: Person) => {
    if (!user) {
      toast({
        title: 'Not logged in',
        description: 'You must be logged in to save friends.',
        variant: 'destructive',
      });
      return;
    }

    const personData = {
      name: person.name,
      venmoId: person.venmoId,
    };

    const result = await saveFriendToFirestore(user.uid, personData);

    if (result.success) {
      toast({
        title: 'Saved to friends',
        description: `${person.name} has been saved to your friends list.`,
      });
    } else if (result.error) {
      toast({
        title: result.error.title,
        description: result.error.description,
        variant: 'destructive',
      });
    }
  };

  return {
    people,
    newPersonName,
    newPersonVenmoId,
    useNameAsVenmoId,
    setNewPersonName,
    setNewPersonVenmoId,
    setUseNameAsVenmoId,
    addPerson,
    addFromFriend,
    removePerson,
    savePersonAsFriend,
    setPeople,
  };
}
