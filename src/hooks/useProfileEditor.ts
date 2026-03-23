import { useState, useEffect } from 'react';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { storage } from '@/config/firebase';
import { useUserProfile } from './useUserProfile';
import { useAuth } from '@/contexts/AuthContext';
import imageCompression from 'browser-image-compression';

export function useProfileEditor() {
  const { user, signOut } = useAuth();
  const { profile, loading, updateVenmoId, updatePhotoURL } = useUserProfile();
  const [venmoId, setVenmoId] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);

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

  const uploadProfilePhoto = async (file: File) => {
    if (!user) return;
    setIsUploadingPhoto(true);
    try {
      const compressed = await imageCompression(file, {
        maxSizeMB: 0.5,
        maxWidthOrHeight: 512,
        useWebWorker: true,
        fileType: 'image/jpeg',
      });

      const fileName = `${Date.now()}-profile.jpg`;
      const storageRef = ref(storage, `profile-photos/${user.uid}/${fileName}`);
      await uploadBytes(storageRef, compressed);
      const downloadURL = await getDownloadURL(storageRef);
      await updatePhotoURL(downloadURL, true);
    } catch (error) {
      console.error('Error uploading profile photo:', error);
    } finally {
      setIsUploadingPhoto(false);
    }
  };

  const removeProfilePhoto = async () => {
    if (!user || !profile?.photoURL) return;
    setIsUploadingPhoto(true);
    try {
      // Try to delete from storage if it's a custom upload
      if (profile.hasCustomPhoto && profile.photoURL.includes('profile-photos')) {
        try {
          const storageRef = ref(storage, profile.photoURL);
          await deleteObject(storageRef);
        } catch {
          // File may already be deleted, continue
        }
      }
      await updatePhotoURL(null, false);
    } catch (error) {
      console.error('Error removing profile photo:', error);
    } finally {
      setIsUploadingPhoto(false);
    }
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
    isUploadingPhoto,

    // Actions
    setVenmoId,
    handleSave,
    handleCancel,
    startEditing,
    setIsEditing,
    uploadProfilePhoto,
    removeProfilePhoto,
  };
}
