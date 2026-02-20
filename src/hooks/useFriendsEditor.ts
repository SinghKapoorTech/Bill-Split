import { useState, useEffect } from 'react';
import { useUserProfile } from './useUserProfile';
import { useToast } from './use-toast';
import { ERROR_MESSAGES } from '@/utils/uiConstants';

interface Friend {
  name: string;
  venmoId?: string;
}

export function useFriendsEditor() {
  const { profile, updateFriends } = useUserProfile();
  const { toast } = useToast();
  const [friends, setFriends] = useState<Friend[]>([]);
  const [newFriendName, setNewFriendName] = useState('');
  const [newFriendVenmoId, setNewFriendVenmoId] = useState('');
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editingName, setEditingName] = useState('');
  const [editingVenmoId, setEditingVenmoId] = useState('');

  useEffect(() => {
    if (profile?.friends) {
      setFriends(profile.friends);
    }
  }, [profile]);

  const handleAddFriend = async () => {
    if (!newFriendName.trim()) {
      toast({
        title: ERROR_MESSAGES.NAME_REQUIRED,
        description: ERROR_MESSAGES.NAME_REQUIRED_DESC,
        variant: 'destructive',
      });
      return;
    }

    const newFriend: Friend = {
      name: newFriendName.trim(),
      venmoId: newFriendVenmoId.replace(/^@+/, '').trim() || undefined,
    };

    const updatedFriends = [...friends, newFriend];
    setFriends(updatedFriends);
    setNewFriendName('');
    setNewFriendVenmoId('');
    await updateFriends(updatedFriends);
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
      name: editingName.trim(),
      venmoId: editingVenmoId.replace(/^@+/, '').trim() || undefined,
    };

    setFriends(updatedFriends);
    setEditingIndex(null);
    setEditingName('');
    setEditingVenmoId('');
    await updateFriends(updatedFriends);
  };

  const handleCancelEdit = () => {
    setEditingIndex(null);
    setEditingName('');
    setEditingVenmoId('');
  };

  return {
    // Data
    friends,
    newFriendName,
    newFriendVenmoId,
    editingIndex,
    editingName,
    editingVenmoId,

    // Setters
    setNewFriendName,
    setNewFriendVenmoId,
    setEditingName,
    setEditingVenmoId,

    // Actions
    handleAddFriend,
    handleRemoveFriend,
    handleEditFriend,
    handleSaveEdit,
    handleCancelEdit,
  };
}
