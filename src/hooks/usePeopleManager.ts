import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useUserProfile } from './useUserProfile';
import { Person } from '@/types';
import { useToast } from './use-toast';
import { generatePersonId, generateUserId, ensureUserInPeople } from '@/utils/billCalculations';
import { validatePersonInput } from '@/utils/validation';
import { createPersonObject } from '@/utils/firestore';
import { userService } from '@/services/userService';
import { doc, updateDoc, arrayUnion, arrayRemove } from 'firebase/firestore';
import { db } from '@/config/firebase';

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

  const addPerson = async (overrideName?: string, overrideVenmoId?: string): Promise<Person | null> => {
    const nameToUse = overrideName !== undefined ? overrideName : newPersonName;
    const venmoIdToUse = overrideVenmoId !== undefined ? overrideVenmoId : newPersonVenmoId;

    // Check if it's an email search
    const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(nameToUse.trim());
    
    if (isEmail) {
      toast({
        title: 'Searching...',
        description: `Looking up user by email...`,
        duration: 1500,
      });
      const globalUser = await userService.getUserByContact(nameToUse.trim());
      
      if (!globalUser) {
        toast({
          title: 'User Not Found',
          description: `No user found with the email ${nameToUse.trim()}.`,
          variant: 'destructive',
        });
        return null;
      }
      
      const newPerson: Person = {
        id: generateUserId(globalUser.uid),
        name: globalUser.displayName || 'App User',
      };
      if (globalUser.venmoId) {
        newPerson.venmoId = globalUser.venmoId;
      }
      
      const alreadyExists = people.some(p => p.id === newPerson.id);
      if (!alreadyExists) {
        setPeople([...people, newPerson]);
      }
      
      setNewPersonName('');
      setNewPersonVenmoId('');
      return newPerson;
    }

    // Validate input
    const validation = validatePersonInput(nameToUse);
    if (!validation.isValid && validation.error) {
      toast({
        title: validation.error.title,
        description: validation.error.description,
        variant: 'destructive',
      });
      return null;
    }

    // Create person object with proper venmoId handling
    const personData = createPersonObject(nameToUse, venmoIdToUse);

    const newPerson: Person = {
      id: generatePersonId(),
      ...personData,
    };

    setPeople([...people, newPerson]);

    // Reset form
    setNewPersonName('');
    setNewPersonVenmoId('');

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

  const addFromFriend = (friend: { id?: string; name: string; venmoId?: string }): Person | null => {
    // Determine the ID: if friend has an id from global search use it, otherwise generate a generic one
    const personId = friend.id || generatePersonId();
    
    // Check if person already exists in the bill
    const alreadyExists = people.some(p => p.id === personId);
    if (alreadyExists) {
      toast({
        title: 'Already added',
        description: `${friend.name} is already on the bill.`,
        variant: 'destructive',
        duration: 1500,
      });
      return null;
    }

    const newPerson: Person = {
      id: personId,
      name: friend.name,
    };
    if (friend.venmoId) {
      newPerson.venmoId = friend.venmoId;
    }

    setPeople([...people, newPerson]);

    toast({
      title: 'Added to bill',
      description: `${friend.name} has been added to the bill.`,
      duration: 1000,
    });

    return newPerson;
  };

  const savePersonAsFriend = async (person: Person, contactInfo?: string) => {
    if (!user) {
      toast({
        title: 'Not logged in',
        description: 'You must be logged in to save friends.',
        variant: 'destructive',
      });
      return;
    }

    try {
      let friendId = person.id;
      
      // If it's a manually created person during the bill session
      if (friendId.startsWith('person-')) {
        if (!contactInfo) {
          toast({
            title: 'Contact info required',
            description: 'Cannot save a manually added person without contact info.',
            variant: 'destructive'
          });
          return;
        }
        
        // Resolve user via email/phone (finds existing or creates shadow)
        friendId = await userService.resolveUser(contactInfo, person.name);
      }

      // If they have a Venmo ID, ensure the friend's profile is updated
      if (person.venmoId) {
        try {
          const cleanVenmoId = person.venmoId.replace(/^@+/, '').trim();
          await updateDoc(doc(db, 'users', friendId), { venmoId: cleanVenmoId });
        } catch (e) {
          // Ignore permission errors if we can't update a non-shadow user's profile
        }
      }

      // Append Friend ID to the user's friends list
      await updateDoc(doc(db, 'users', user.uid), {
        friends: arrayUnion(friendId)
      });

      toast({
        title: 'Saved to friends',
        description: `${person.name} has been saved to your friends list.`,
        duration: 1000,
      });
    } catch (error: any) {
      toast({
        title: 'Error saving friend',
        description: error.message || 'Could not save to friends list.',
        variant: 'destructive',
      });
    }
  };

  const removePersonFromFriends = async (friendId: string) => {
    if (!user) return;
    try {
      if (friendId.startsWith('person-')) {
          console.warn('Cannot directly remove a person- ID from friends without resolving. Pass the resolved friend ID.');
          return;
      }
      await updateDoc(doc(db, 'users', user.uid), {
        friends: arrayRemove(friendId)
      });
      toast({
        title: 'Removed from friends',
        description: 'Successfully removed from your friends list.',
        duration: 1000,
      });
    } catch (error: any) {
      toast({
        title: 'Error removing friend',
        description: error.message || 'Could not remove from friends list.',
        variant: 'destructive',
      });
    }
  };

  return {
    people,
    newPersonName,
    newPersonVenmoId,
    setNewPersonName,
    setNewPersonVenmoId,
    addPerson,
    addFromFriend,
    removePerson,
    savePersonAsFriend,
    removePersonFromFriends,
    setPeople,
  };
}
