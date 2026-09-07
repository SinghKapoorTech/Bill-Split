import { useState } from 'react';
import { KeyRound, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { auth } from '@/config/firebase';
import {
  currentProviderIds,
  describeProvider,
  isAppleRelayAddress,
  linkPassword,
} from '@/services/passwordLinkService';
import { reauthNeedsPassword } from '@/services/reauthService';
import { describePasswordAuthError, isSilentAuthCancellation } from '@/utils/authProviders';

/**
 * Lets someone add an email and password to the account they already have.
 *
 * This exists because Sign in with Apple ships on iOS only, so an Apple user
 * had no way into their account from a desktop browser. Adding a password here
 * gives them one WITHOUT creating a second account — which matters because the
 * ledger is keyed on uid, and a duplicate identity would strand their real
 * balances on the account they can no longer reach.
 */
export const SignInMethodsCard = () => {
  const { user } = useAuth();
  const { toast } = useToast();

  const providerIds = currentProviderIds();
  const alreadyHasPassword = providerIds.includes('password');
  const relayHidden = isAppleRelayAddress(user?.email);

  // Prefilling a relay address would be worse than leaving it blank: the user
  // has never seen it and cannot read mail sent to it.
  const [email, setEmail] = useState(relayHidden ? '' : (user?.email ?? ''));
  const [password, setPassword] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [busy, setBusy] = useState(false);

  // Only asked for when reauthentication cannot be done through a provider
  // sheet — an Apple or Google user re-proves themselves that way instead.
  const needsCurrentPassword = reauthNeedsPassword(
    (auth.currentUser?.providerData ?? []).map((p) => p?.providerId)
  );

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy) return;

    setBusy(true);
    try {
      await linkPassword(email.trim(), password, currentPassword || undefined);
      setPassword('');
      setCurrentPassword('');
      toast({
        title: 'Password added',
        description: `You can now sign in at divit-bill.com with ${email.trim()}. Check your inbox to verify the address.`,
      });
    } catch (error: unknown) {
      // Backing out of the Apple/Google reauthentication sheet is a gesture,
      // not a failure.
      if (isSilentAuthCancellation(error)) return;

      console.error('[SignInMethods] link failed:', error);
      toast({
        title: 'Could not add a password',
        description: describePasswordAuthError(error, 'link'),
        variant: 'destructive',
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="p-4">
      <div className="flex items-start gap-3">
        <KeyRound className="w-5 h-5 text-muted-foreground shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-foreground">Sign-in methods</h3>
          <p className="text-sm text-muted-foreground mt-1">
            {providerIds.length > 0
              ? `You sign in with ${providerIds.map(describeProvider).join(' and ')}.`
              : 'No sign-in methods found for this account.'}
          </p>
        </div>
      </div>

      {alreadyHasPassword ? (
        <p className="text-sm text-muted-foreground mt-3">
          You can sign in with your email and password on any device.
        </p>
      ) : (
        <form onSubmit={submit} className="mt-4 space-y-3">
          <p className="text-sm text-muted-foreground">
            Add a password so you can sign in from a web browser, where Sign in with Apple is not
            available.
          </p>

          <div className="space-y-1.5">
            <Label htmlFor="link-email">Email</Label>
            <Input
              id="link-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              required
              disabled={busy}
            />
            {relayHidden && (
              <p className="text-xs text-muted-foreground">
                Apple hid your real email address. Enter one you can receive mail at.
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="link-password">New password</Label>
            <Input
              id="link-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
              required
              minLength={6}
              disabled={busy}
            />
          </div>

          {needsCurrentPassword && (
            <div className="space-y-1.5">
              <Label htmlFor="link-current-password">Current password</Label>
              <Input
                id="link-current-password"
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                autoComplete="current-password"
                disabled={busy}
              />
            </div>
          )}

          <Button type="submit" className="w-full min-h-[44px]" disabled={busy}>
            {busy ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Adding...
              </>
            ) : (
              'Add password'
            )}
          </Button>
        </form>
      )}
    </Card>
  );
};
