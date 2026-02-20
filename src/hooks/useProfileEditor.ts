import { useState, useEffect } from 'react';
import { useUserProfile } from './useUserProfile';
import { useAuth } from '@/contexts/AuthContext';

export function useProfileEditor() {
  const { user, signOut } = useAuth();
  const { profile, loading, updateVenmoId } = useUserProfile();
  const [venmoId, setVenmoId] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (profile?.venmoId) {
      setVenmoId(profile.venmoId.replace(/^@+/, ''));
    }
  }, [profile]);

  const handleSave = async () => {
    setSaving(true);
    await updateVenmoId(venmoId.trim());
    setSaving(false);
    setIsEditing(false);
  };

  const handleCancel = () => {
    setVenmoId(profile?.venmoId?.replace(/^@+/, '') || '');
    setIsEditing(false);
  };

  const startEditing = () => {
    setIsEditing(true);
  };

  return {
    // Data
    user,
    signOut,
    profile,
    loading,
    venmoId,
    isEditing,
    saving,

    // Actions
    setVenmoId,
    handleSave,
    handleCancel,
    startEditing,
    setIsEditing,
  };
}
