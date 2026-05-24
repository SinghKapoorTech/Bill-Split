import { useState, useEffect } from 'react';
import { useUserProfile } from './useUserProfile';
import { useToast } from './use-toast';
import { ERROR_MESSAGES } from '@/utils/uiConstants';
import { userService } from '@/services/userService';
import { Friend } from '@/types/person.types';

export function useFriendsEditor() {
  const { profile, updateFriends } = useUserProfile();
  const { toast } = useToast();
  const [friends, setFriends] = useState<Friend[]>([]);
  const [isLoadingFriends, setIsLoadingFriends] = useState(false);

  // Search State
  const [searchInput, setSearchInput] = useState('');
  const [friendSuggestions, setFriendSuggestions] = useState<Friend[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);

  // Manual Add State
  const [newFriendName, setNewFriendName] = useState('');
  const [newFriendVenmoId, setNewFriendVenmoId] = useState('');
  const [newFriendEmail, setNewFriendEmail] = useState('');

  const refreshFriends = async () => {
    if (!profile?.uid) return;
    setIsLoadingFriends(true);
    try {
      const hydrated = await userService.getHydratedFriends(profile.uid);
      setFriends(hydrated);
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoadingFriends(false);
    }
  };

  useEffect(() => {
    refreshFriends();
  }, [profile?.uid, profile?.friends]);

  // Handle Search
  useEffect(() => {
    const search = searchInput.trim();
    if (search.length === 0) {
      setFriendSuggestions([]);
      setShowSuggestions(false);
      return;
    }

    let isActive = true;

    const performSearch = async () => {
      try {
        let globalUsers = [];
        const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(search);

        if (isEmail) {
          const userByEmail = await userService.getUserByContact(search);
          if (userByEmail) {
            globalUsers.push(userByEmail);
          }
        } else if (search.length >= 2) {
          globalUsers = await userService.searchUsersByUsername(search);
        }

        if (!isActive) return;

        const suggestions: Friend[] = globalUsers
          .filter(u => u.uid !== profile?.uid && !friends.some(f => f.id === u.uid))
          .map(u => ({
            id: u.uid,
            name: u.displayName || 'App User',
            venmoId: u.venmoId,
            email: u.email || u.phoneNumber,
            username: u.username,
            balance: 0
          }));

        setFriendSuggestions(suggestions);
        setShowSuggestions(suggestions.length > 0);
      } catch (error) {
        console.error("Global search failed", error);
        if (isActive) {
          setFriendSuggestions([]);
          setShowSuggestions(false);
        }
      }
    };

    performSearch();

    return () => {
      isActive = false;
    };
  }, [searchInput, profile?.uid, friends]);

  const handleAddFromSearch = async (suggestion: Friend) => {
    const updatedFriends = [...friends, suggestion];
    setFriends(updatedFriends);
    setSearchInput('');
    setNewFriendName('');
    setNewFriendEmail('');
    setNewFriendVenmoId('');
    setShowSuggestions(false);
    await updateFriends(updatedFriends);
  };

  const handleAddFriend = async (name?: string, email?: string, venmoId?: string) => {
    const finalName = name ?? newFriendName;
    const finalEmail = email ?? newFriendEmail;
    const finalVenmoId = venmoId ?? newFriendVenmoId;

    if (!finalName.trim()) {
      toast({
        title: ERROR_MESSAGES.NAME_REQUIRED,
        description: ERROR_MESSAGES.NAME_REQUIRED_DESC,
        variant: 'destructive',
      });
      return;
    }

    if (!finalEmail.trim()) {
      toast({
        title: 'Email Required',
        description: 'An email is required to add an external friend so they can access the app later.',
        variant: 'destructive',
      });
      return;
    }

    try {
      // Create or resolve shadow user
      const userId = await userService.resolveUser(finalEmail.trim(), finalName.trim());

      const newFriend: Friend = {
        id: userId,
        name: finalName.trim(),
        email: finalEmail.trim(),
        venmoId: finalVenmoId.replace(/^@+/, '').trim() || undefined,
        balance: 0,
      };

      const updatedFriends = [...friends, newFriend];
      setFriends(updatedFriends);
      setSearchInput('');
      setNewFriendName('');
      setNewFriendEmail('');
      setNewFriendVenmoId('');
      setShowSuggestions(false);
      await updateFriends(updatedFriends);
    } catch (error: unknown) {
      toast({
        title: 'Error adding friend',
        description: (error as Error).message,
        variant: 'destructive',
      });
    }
  };

  const handleRemoveFriend = async (index: number) => {
    const updatedFriends = friends.filter((_, i) => i !== index);
    setFriends(updatedFriends);
    await updateFriends(updatedFriends);
  };

  const handleEditFriend = async (friendId: string, updates: { name?: string; email?: string; venmoId?: string }) => {
    try {
      await userService.updateShadowUser(friendId, updates);
      await refreshFriends();
    } catch (error: unknown) {
      toast({
        title: 'Error updating friend',
        description: (error as Error).message,
        variant: 'destructive',
      });
    }
  };

  return {
    // Data
    friends,
    searchInput,
    friendSuggestions,
    showSuggestions,
    newFriendName,
    newFriendVenmoId,
    newFriendEmail,
    isLoadingFriends,

    // Setters
    setSearchInput,
    setNewFriendName,
    setNewFriendVenmoId,
    setNewFriendEmail,

    // Actions
    handleAddFromSearch,
    handleAddFriend,
    handleEditFriend,
    handleRemoveFriend,
    refreshFriends,
  };
}
