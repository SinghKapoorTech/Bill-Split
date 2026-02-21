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

  // Search State
  const [searchInput, setSearchInput] = useState('');
  const [friendSuggestions, setFriendSuggestions] = useState<Friend[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);

  // Manual Add State
  const [newFriendName, setNewFriendName] = useState('');
  const [newFriendVenmoId, setNewFriendVenmoId] = useState('');
  const [newFriendEmail, setNewFriendEmail] = useState('');

  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editingName, setEditingName] = useState('');
  const [editingVenmoId, setEditingVenmoId] = useState('');
  const [editingEmail, setEditingEmail] = useState('');

  useEffect(() => {
    if (profile?.friends) {
      setFriends(profile.friends);
    }
  }, [profile]);

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
            username: u.username
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

  const handleAddFriend = async () => {
    if (!newFriendName.trim()) {
      toast({
        title: ERROR_MESSAGES.NAME_REQUIRED,
        description: ERROR_MESSAGES.NAME_REQUIRED_DESC,
        variant: 'destructive',
      });
      return;
    }

    if (!newFriendEmail.trim()) {
      toast({
        title: 'Email Required',
        description: 'An email is required to add an external friend so they can access the app later.',
        variant: 'destructive',
      });
      return;
    }

    try {
      // Create or resolve shadow user
      const userId = await userService.resolveUser(newFriendEmail.trim(), newFriendName.trim());

      const newFriend: Friend = {
        id: userId,
        name: newFriendName.trim(),
        email: newFriendEmail.trim(),
        venmoId: newFriendVenmoId.replace(/^@+/, '').trim() || undefined,
      };

      const updatedFriends = [...friends, newFriend];
      setFriends(updatedFriends);
      setSearchInput('');
      setNewFriendName('');
      setNewFriendEmail('');
      setNewFriendVenmoId('');
      setShowSuggestions(false);
      await updateFriends(updatedFriends);
    } catch (error: any) {
      toast({
        title: 'Error adding friend',
        description: error.message,
        variant: 'destructive',
      });
    }
  };

  const handleRemoveFriend = async (index: number) => {
    const updatedFriends = friends.filter((_, i) => i !== index);
    setFriends(updatedFriends);
    await updateFriends(updatedFriends);
  };

  const handleEditFriend = (index: number) => {
    setEditingIndex(index);
    setEditingName(friends[index].name);
    setEditingVenmoId(friends[index].venmoId || '');
    setEditingEmail(friends[index].email || '');
  };

  const handleSaveEdit = async () => {
    if (!editingName.trim()) {
      toast({
        title: ERROR_MESSAGES.NAME_REQUIRED,
        description: ERROR_MESSAGES.NAME_REQUIRED_DESC,
        variant: 'destructive',
      });
      return;
    }

    const updatedFriends = [...friends];
    updatedFriends[editingIndex!] = {
      ...updatedFriends[editingIndex!],
      name: editingName.trim(),
      venmoId: editingVenmoId.replace(/^@+/, '').trim() || undefined,
      email: editingEmail.trim() || undefined,
    };

    setFriends(updatedFriends);
    setEditingIndex(null);
    setEditingName('');
    setEditingVenmoId('');
    setEditingEmail('');
    await updateFriends(updatedFriends);
  };

  const handleCancelEdit = () => {
    setEditingIndex(null);
    setEditingName('');
    setEditingVenmoId('');
    setEditingEmail('');
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
    editingIndex,
    editingName,
    editingVenmoId,
    editingEmail,

    // Setters
    setSearchInput,
    setNewFriendName,
    setNewFriendVenmoId,
    setNewFriendEmail,
    setEditingName,
    setEditingVenmoId,
    setEditingEmail,

    // Actions
    handleAddFromSearch,
    handleAddFriend,
    handleRemoveFriend,
    handleEditFriend,
    handleSaveEdit,
    handleCancelEdit,
  };
}
