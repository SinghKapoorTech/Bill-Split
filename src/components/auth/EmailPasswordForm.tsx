import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/contexts/AuthContext';

type Mode = 'signin' | 'signup';

interface EmailPasswordFormProps {
  /** Disables the form during an unrelated busy state, e.g. a guest claim. */
  disabled?: boolean;
}

/**
 * Email and password sign-in, sitting under the OAuth buttons.
 *
 * This is the only way into a Divit account from a desktop browser for someone
 * who signed up with Apple — Apple sign-in is iOS-only, by deliberate design
 * (see shouldOfferApple) — provided they first added a password from Settings
 * in the iOS app.
 *
 * Errors are surfaced by AuthContext as toasts and rethrown, which is why the
 * catch here is empty: the form's job on failure is simply to stay mounted with
 * the user's values intact so they can correct and retry.
 */
export const EmailPasswordForm = ({ disabled = false }: EmailPasswordFormProps) => {
  const { signInWithPassword, signUpWithPassword, sendPasswordReset } = useAuth();
  const [mode, setMode] = useState<Mode>('signin');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy || disabled) return;

    setBusy(true);
    try {
      if (mode === 'signup') {
        await signUpWithPassword(name.trim(), email.trim(), password);
      } else {
        await signInWithPassword(email.trim(), password);
      }
    } catch {
      // Already reported by AuthContext; keep the form as the user left it.
    } finally {
      setBusy(false);
    }
  };

  const handleReset = async () => {
    if (!email.trim()) return;
    setBusy(true);
    try {
      await sendPasswordReset(email.trim());
    } finally {
      setBusy(false);
    }
  };

  const locked = busy || disabled;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <span className="h-px flex-1 bg-border" />
        <span className="text-xs text-muted-foreground">or</span>
        <span className="h-px flex-1 bg-border" />
      </div>

      <form onSubmit={submit} className="space-y-3">
        {mode === 'signup' && (
          <div className="space-y-1.5">
            <Label htmlFor="auth-name">Name</Label>
            <Input
              id="auth-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="name"
              required
              disabled={locked}
            />
          </div>
        )}

        <div className="space-y-1.5">
          <Label htmlFor="auth-email">Email</Label>
          <Input
            id="auth-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            required
            disabled={locked}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="auth-password">Password</Label>
          <Input
            id="auth-password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
            required
            minLength={6}
            disabled={locked}
          />
        </div>

        <Button type="submit" className="w-full min-h-[44px]" disabled={locked}>
          {busy ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Please wait...
            </>
          ) : mode === 'signup' ? (
            'Create account'
          ) : (
            'Sign in'
          )}
        </Button>
      </form>

      <div className="flex items-center justify-between text-xs">
        <button
          type="button"
          className="text-muted-foreground hover:text-foreground transition-colors"
          onClick={() => setMode(mode === 'signin' ? 'signup' : 'signin')}
          disabled={locked}
        >
          {mode === 'signin' ? 'Create an account' : 'I already have an account'}
        </button>

        {mode === 'signin' && (
          <button
            type="button"
            className="text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
            onClick={handleReset}
            disabled={locked || !email.trim()}
          >
            Forgot password?
          </button>
        )}
      </div>
    </div>
  );
};
