import { useEffect, useState } from 'react';
import { MailWarning, Loader2 } from 'lucide-react';
import { sendEmailVerification } from 'firebase/auth';
import { auth } from '@/config/firebase';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { hasTrustedEmail } from '@/utils/authProviders';

/**
 * Tells a password user why parts of the app are inert until they verify.
 *
 * Unverified accounts are deliberately usable — bills, splitting and Venmo all
 * work. What does not work is anything keyed on email identity: event
 * invitations are not auto-accepted, and friends adding them by email cannot
 * resolve them. Both are enforced in firestore.rules, so they fail server-side
 * whatever the client does; saying so plainly beats letting them fail silently.
 *
 * Firebase never pushes `emailVerified` to a live session, so someone who
 * clicks the link in another tab would keep seeing this banner until they
 * signed out. Reloading the user on window focus is what closes that gap.
 */
export const VerifyEmailBanner = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [sending, setSending] = useState(false);
  // Bumped purely to re-render after a reload has refreshed the auth state in
  // place; `auth.currentUser` mutates without notifying React.
  const [, setReloadCount] = useState(0);

  useEffect(() => {
    const refresh = () => {
      auth.currentUser
        ?.reload()
        .then(() => setReloadCount((n) => n + 1))
        .catch(() => undefined);
    };

    window.addEventListener('focus', refresh);
    return () => window.removeEventListener('focus', refresh);
  }, []);

  if (!user || hasTrustedEmail(auth.currentUser ?? user)) return null;

  const resend = async () => {
    if (!auth.currentUser) return;
    setSending(true);
    try {
      await sendEmailVerification(auth.currentUser);
      toast({
        title: 'Verification sent',
        description: `Check ${user.email} for the link.`,
      });
    } catch (error) {
      console.error('[VerifyEmail] resend failed:', error);
      toast({
        title: 'Could not send the email',
        description: 'Please wait a moment and try again.',
        variant: 'destructive',
      });
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 mb-4">
      <div className="flex items-start gap-3">
        <MailWarning className="w-5 h-5 text-amber-600 dark:text-amber-500 shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground">Verify your email</p>
          <p className="text-sm text-muted-foreground mt-0.5">
            Until you confirm {user.email}, friends can't find you by email and event invitations
            won't be accepted automatically.
          </p>
          <Button variant="outline" size="sm" className="mt-2" onClick={resend} disabled={sending}>
            {sending ? (
              <>
                <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" />
                Sending...
              </>
            ) : (
              'Resend verification email'
            )}
          </Button>
        </div>
      </div>
    </div>
  );
};
