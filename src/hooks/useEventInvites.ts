import { useState } from 'react';
import { httpsCallable } from 'firebase/functions';
import { functions } from '@/config/firebase';
import { useToast } from './use-toast';

interface InviteMemberResponse {
  success: boolean;
  userExists: boolean;
  message: string;
}

export function useEventInvites(eventId: string) {
  const [isInviting, setIsInviting] = useState(false);
  const { toast } = useToast();

  const inviteMember = async (email: string): Promise<boolean> => {
    setIsInviting(true);

    try {
      const inviteMemberToEvent = httpsCallable<
        { eventId: string; email: string },
        InviteMemberResponse
      >(functions, 'inviteMemberToEvent');

      const result = await inviteMemberToEvent({ eventId, email });

      if (result.data.success) {
        toast({
          title: result.data.userExists ? 'Member added' : 'Invitation sent',
          description: result.data.message,
        });
        return true;
      }

      return false;
    } catch (error: any) {
      console.error('Error inviting member:', error);

      let errorMessage = 'Failed to invite member. Please try again.';

      if (error.code === 'functions/already-exists') {
        errorMessage = error.message;
      } else if (error.code === 'functions/permission-denied') {
        errorMessage = 'You do not have permission to invite members to this event.';
      } else if (error.code === 'functions/not-found') {
        errorMessage = 'Event not found.';
      } else if (error.code === 'functions/invalid-argument') {
        errorMessage = error.message || 'Invalid email address.';
      }

      toast({
        title: 'Error',
        description: errorMessage,
        variant: 'destructive',
      });

      return false;
    } finally {
      setIsInviting(false);
    }
  };

  return {
    inviteMember,
    isInviting,
  };
}
