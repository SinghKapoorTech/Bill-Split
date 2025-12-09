import { useState, useRef } from 'react';
import imageCompression from 'browser-image-compression';
import { validateFile } from '@/utils/validation';
import { useToast } from './use-toast';

export function useFileUpload() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isCompressing, setIsCompressing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const handleFileSelect = async (file: File) => {
    const error = validateFile(file);
    if (error) {
      toast({
        title: error.title,
        description: error.description,
        variant: 'destructive',
      });
      return;
    }

    setIsCompressing(true);

    try {
      // Compress image for faster upload and processing
      // Use more conservative settings on mobile to avoid canvas size issues
      const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

      const options = {
        maxSizeMB: 1,           // Max 1MB
        maxWidthOrHeight: isMobile ? 800 : 1024, // Lower resolution on mobile
        useWebWorker: true,     // Use web worker for better performance
        fileType: 'image/jpeg', // Convert to JPEG for smaller size
        initialQuality: isMobile ? 0.8 : 0.9, // Slightly more compression on mobile
      };

      const compressedFile = await imageCompression(file, options);

      // Show compression savings
      const originalSizeMB = (file.size / 1024 / 1024).toFixed(2);
      const compressedSizeMB = (compressedFile.size / 1024 / 1024).toFixed(2);

      // Image was optimized if file.size > compressedFile.size * 1.1

      setSelectedFile(compressedFile);

      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreview(reader.result as string);
      };
      reader.readAsDataURL(compressedFile);
    } catch (err) {
      console.error('Compression failed:', err);

      // Fallback to original file
      setSelectedFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    } finally {
      setIsCompressing(false);
    }
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleFileSelect(file);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    const file = e.dataTransfer.files?.[0];
    if (file) {
      handleFileSelect(file);
    }
  };

  const handleRemoveImage = () => {
    setSelectedFile(null);
    setImagePreview(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return {
    selectedFile,
    imagePreview,
    isDragging,
    isCompressing,
    fileInputRef,
    handleFileInput,
    handleDragOver,
    handleDragLeave,
    handleDrop,
    handleRemoveImage,
    handleFileSelect, // Expose handleFileSelect
    setSelectedFile,
    setImagePreview,
  };
}
