import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, Loader2, Trash2 } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { auth } from '@/config/firebase';
import { reauthNeedsPassword } from '@/services/reauthService';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { accountService } from '@/services/accountService';
import { userService } from '@/services/userService';
import { isSilentAuthCancellation } from '@/utils/authProviders';
import type { Friend } from '@/types/person.types';

/**
 * In-app account deletion, required by App Store Review Guideline 5.1.1(v).
 *
 * Apple is explicit that an email address or any other support flow does not
 * satisfy this, and that deactivation is not deletion. The control must be
 * reachable without contacting anyone, which is why it lives in plain sight at
 * the bottom of Settings → Profile.
 *
 * Outstanding balances produce a WARNING, never a block. Refusing to delete
 * until someone settles up would both hold an account hostage over a disputed
 * few dollars and read to a reviewer as exactly the gate the guideline forbids.
 */
export const DeleteAccountCard = () => {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [finalOpen, setFinalOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [outstanding, setOutstanding] = useState<Friend[]>([]);
  const [password, setPassword] = useState('');

  // A password-only account cannot re-prove itself through a provider sheet, so
  // it has to type the password instead. Without this branch such a user hits
  // the Google popup and fails with auth/user-mismatch — meaning they could
  // never delete their account, which Guideline 5.1.1(v) does not allow.
  const needsPassword = reauthNeedsPassword(
    (auth.currentUser?.providerData ?? []).map((p) => p?.providerId)
  );
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  // Read straight from the ledger rather than the friends list: getActiveBalances
  // covers shadow users and non-friend app users too, and a warning that omits
  // half of someone's debts is worse than no warning.
  useEffect(() => {
    if (!user?.uid) return;
    let cancelled = false;

    userService
      .getActiveBalances(user.uid)
      .then((balances) => {
        if (!cancelled) setOutstanding(balances);
      })
      .catch((err) => console.error('[DeleteAccount] could not load balances:', err));

    return () => {
      cancelled = true;
    };
  }, [user?.uid]);

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await accountService.deleteAccount(password || undefined);
      toast({
        title: 'Account deleted',
        description: 'Your Divit account and personal information have been removed.',
      });
      navigate('/');
    } catch (error: unknown) {
      // Backing out of the reauthentication sheet is not a failure — but ONLY
      // at that step. `isSilentAuthCancellation` matches any message containing
      // "cancel", so applying it to the whole flow would silently swallow a
      // cancelled/aborted callable after the server cascade had already begun.
      if ((error as { reauthFailed?: boolean })?.reauthFailed && isSilentAuthCancellation(error)) {
        return;
      }

      console.error('[DeleteAccount] failed:', error);
      toast({
        title: 'Could not delete your account',
        description:
          (error as Error)?.message ||
          'Something went wrong. Your account has not been changed — please try again.',
        variant: 'destructive',
      });
    } finally {
      setDeleting(false);
      setFinalOpen(false);
      setConfirmOpen(false);
      setPassword('');
    }
  };

  return (
    <>
      <Card className="p-4 border-destructive/40">
        <div className="flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-foreground">Delete account</h3>
            <p className="text-sm text-muted-foreground mt-1">
              Permanently removes your Divit account and personal information. This cannot be
              undone.
            </p>
          </div>
        </div>

        <Button
          variant="destructive"
          className="w-full mt-4"
          onClick={() => setConfirmOpen(true)}
          disabled={deleting}
        >
          <Trash2 className="w-4 h-4 mr-2" />
          Delete my account
        </Button>
      </Card>

      {/* Step 1 — what actually happens, stated without euphemism. */}
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete your account?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 text-sm">
                <p>
                  This permanently removes your Divit account and your personal information. You
                  will not be able to sign in again.
                </p>
                <p>
                  Bills you shared with friends stay on their accounts, and any balances between
                  you are not cleared by deleting.
                </p>

                {outstanding.length > 0 && (
                  <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3">
                    <p className="font-medium text-foreground">You have unsettled balances:</p>
                    <ul className="mt-1 space-y-0.5">
                      {outstanding.map((f) => (
                        <li key={f.id ?? f.name}>
                          {(f.balance ?? 0) > 0
                            ? `${f.name} owes you $${Math.abs(f.balance ?? 0).toFixed(2)}`
                            : `You owe ${f.name} $${Math.abs(f.balance ?? 0).toFixed(2)}`}
                        </li>
                      ))}
                    </ul>
                    <p className="mt-2">Deleting your account will not settle these.</p>
                  </div>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep my account</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(e) => {
                e.preventDefault();
                setConfirmOpen(false);
                setFinalOpen(true);
              }}
            >
              Continue
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Step 2 — a deliberate second stop before an irreversible action. */}
      <AlertDialog open={finalOpen} onOpenChange={setFinalOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>This cannot be undone</AlertDialogTitle>
            <AlertDialogDescription>
              {needsPassword
                ? "Enter your password to confirm it's you, and then your account will be deleted immediately."
                : "You'll be asked to sign in once more to confirm it's you, and then your account will be deleted immediately."}
            </AlertDialogDescription>
          </AlertDialogHeader>

          {needsPassword && (
            <div className="space-y-1.5">
              <Label htmlFor="delete-password">Password</Label>
              <Input
                id="delete-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                disabled={deleting}
              />
            </div>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleting}
              onClick={(e) => {
                e.preventDefault();
                handleDelete();
              }}
            >
              {deleting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Deleting...
                </>
              ) : (
                'Delete my account'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
