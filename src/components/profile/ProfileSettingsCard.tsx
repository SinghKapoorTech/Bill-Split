import { useRef, useState } from 'react';
import { User as UserIcon, Check, X, Camera, Loader2, Trash2, MessageSquare } from 'lucide-react';
import { FeedbackModal } from './FeedbackModal';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { useProfileEditor } from '@/hooks/useProfileEditor';
import { useToast } from '@/hooks/use-toast';
import { UI_TEXT, SUCCESS_MESSAGES } from '@/utils/uiConstants';
import { UserAvatar } from '@/components/shared/UserAvatar';

export function ProfileSettingsCard() {
  const {
    user,
    signOut,
    profile,
    venmoId,
    isEditing,
    saving,
    isUploadingPhoto,
    setVenmoId,
    handleSave: save,
    handleCancel,
    startEditing,
    uploadProfilePhoto,
    removeProfilePhoto,
  } = useProfileEditor();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [feedbackOpen, setFeedbackOpen] = useState(false);

  const handleSave = async () => {
    await save();
    toast({
      title: SUCCESS_MESSAGES.PROFILE_UPDATED,
      description: SUCCESS_MESSAGES.PROFILE_UPDATED_DESC,
    });
  };

  const handlePhotoSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      await uploadProfilePhoto(file);
      toast({
        title: 'Photo updated',
        description: 'Your profile photo has been updated.',
      });
    }
    // Reset so the same file can be re-selected
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleRemovePhoto = async () => {
    await removeProfilePhoto();
    toast({
      title: 'Photo removed',
      description: 'Your profile photo has been removed.',
    });
  };

  return (
    <Card className="p-4 md:p-6">
      <div className="flex items-center gap-2 mb-4 md:mb-6">
        <UserIcon className="w-5 h-5 md:w-6 md:h-6 text-primary" />
        <h2 className="text-xl md:text-2xl font-semibold">{UI_TEXT.PROFILE_SETTINGS}</h2>
      </div>

      <div className="space-y-4">
        {/* Profile Photo */}
        <div className="flex items-center gap-4">
          <div className="relative">
            <UserAvatar
              name={profile?.displayName || user?.displayName || 'User'}
              photoURL={profile?.photoURL || user?.photoURL}
              size="lg"
              className="border-2 border-background shadow-sm"
            />
            {isUploadingPhoto && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/40 rounded-full">
                <Loader2 className="w-6 h-6 text-white animate-spin" />
              </div>
            )}
          </div>
          <div className="flex flex-col gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handlePhotoSelect}
            />
            <Button
              variant="outline"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploadingPhoto}
            >
              <Camera className="w-4 h-4 mr-2" />
              Change Photo
            </Button>
            {profile?.hasCustomPhoto && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleRemovePhoto}
                disabled={isUploadingPhoto}
                className="text-destructive hover:text-destructive"
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Remove
              </Button>
            )}
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="name" className="text-sm md:text-base">Name</Label>
          <Input
            id="name"
            value={profile?.displayName || user?.displayName || ''}
            disabled
            className="bg-muted text-base md:text-sm"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="email" className="text-sm md:text-base">Email</Label>
          <Input
            id="email"
            value={profile?.email || user?.email || ''}
            disabled
            className="bg-muted text-base md:text-sm"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="venmoId" className="text-sm md:text-base">
            {UI_TEXT.VENMO_USERNAME}
            <span className="text-xs text-muted-foreground ml-2">
              {UI_TEXT.VENMO_WITHOUT_AT}
            </span>
          </Label>
          <div className="flex gap-2">
            <Input
              id="venmoId"
              placeholder="Enter your Venmo username"
              value={venmoId}
              onChange={(e) => setVenmoId(e.target.value)}
              disabled={!isEditing || saving}
              className="text-base md:text-sm"
            />
            {!isEditing && (
              <Button onClick={startEditing} variant="outline">
                {UI_TEXT.EDIT}
              </Button>
            )}
          </div>
          {!isEditing && (
            <p className="text-xs text-muted-foreground">
              This will be used when others charge you on Venmo
            </p>
          )}
        </div>

        {isEditing && (
          <div className="flex gap-2 pt-2">
            <Button
              onClick={handleSave}
              disabled={saving}
              className="flex-1 bg-green-600 hover:bg-green-700"
            >
              <Check className="w-4 h-4 mr-2" />
              {saving ? UI_TEXT.SAVING : UI_TEXT.SAVE_CHANGES}
            </Button>
            <Button
              onClick={handleCancel}
              disabled={saving}
              variant="outline"
              className="flex-1"
            >
              <X className="w-4 h-4 mr-2" />
              {UI_TEXT.CANCEL}
            </Button>
          </div>
        )}
        <div className="space-y-2">
          <Button
              onClick={signOut}
              variant="outline"
              className="flex-1 text-destructive"
            >
              {UI_TEXT.SIGN_OUT}
            </Button>
        </div>

        <div className="border-t pt-4 mt-2">
          <Button
            onClick={() => setFeedbackOpen(true)}
            variant="outline"
            className="w-full gap-2"
          >
            <MessageSquare className="w-4 h-4" />
            Send Feedback
          </Button>
          <p className="text-xs text-muted-foreground text-center mt-2">
            Report bugs or suggest features
          </p>
        </div>

        <FeedbackModal
          open={feedbackOpen}
          onOpenChange={setFeedbackOpen}
        />
      </div>
    </Card>
  );
}
