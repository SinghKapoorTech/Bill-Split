import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { useAuth } from '@/contexts/AuthContext';
import { ProviderSignInButtons } from '@/components/auth/ProviderSignInButtons';
import { EmailPasswordForm } from '@/components/auth/EmailPasswordForm';
import type { SignInProvider } from '@/utils/authProviders';
import { useGuestClaim } from '@/hooks/useGuestClaim';
import { PENDING_CLAIM_KEY } from '@/utils/guestClaim';

const Auth = () => {
  const { user, loading, signIn } = useAuth();
  const navigate = useNavigate();
  const [pendingProvider, setPendingProvider] = useState<SignInProvider | null>(null);
  const [isClaiming, setIsClaiming] = useState(false);
  const { runPendingClaim } = useGuestClaim();

  // Use sessionStorage to persist across potential app remounts on iOS
  const getInitialLoadState = () => {
    const stored = sessionStorage.getItem('auth_initial_load_complete');
    return stored !== 'true';
  };
  const [initialLoad, setInitialLoad] = useState(getInitialLoadState);

  // Use localStorage to persist guest claim ID and return path across OAuth redirects
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const claimGuestId = params.get('claimGuestId');
    const returnTo = params.get('returnTo');
    if (claimGuestId) {
      localStorage.setItem(PENDING_CLAIM_KEY, claimGuestId);
    }
    if (returnTo) {
      localStorage.setItem('pending_auth_return_to', returnTo);
    }
  }, []);

  // Redirect to home if already logged in, handling shadow user claims first
  useEffect(() => {
    const processUserAndRedirect = async () => {
      if (user) {
        setIsClaiming(true);
        const claim = await runPendingClaim();
        setIsClaiming(false);

        const returnTo = localStorage.getItem('pending_auth_return_to');
        localStorage.removeItem('pending_auth_return_to');
        // After a failed claim the returnTo is the shared bill the new account
        // is not on yet ("We couldn't find your profile"), so go home instead;
        // the error toast explains why.
        navigate(claim === 'failed' ? '/dashboard' : returnTo || '/dashboard');
      }
    };

    processUserAndRedirect();
  }, [user, navigate, runPendingClaim]);

  // Mark initial load as complete after first render
  useEffect(() => {
    if (!loading && initialLoad) {
      setInitialLoad(false);
      sessionStorage.setItem('auth_initial_load_complete', 'true');
    }
  }, [loading, initialLoad]);

  // Handle sign-in
  const handleSignIn = async (provider: SignInProvider) => {
    sessionStorage.setItem('auth_initial_load_complete', 'true');
    setInitialLoad(false);
    setPendingProvider(provider);

    try {
      await signIn(provider);
    } catch (error: unknown) {
      console.error('[Auth] Sign-in error:', error);
    } finally {
      setPendingProvider(null);
    }
  };

  // Show loading spinner during initial auth state check
  if (loading && initialLoad) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-background to-secondary/30 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-secondary/30 flex items-center justify-center p-4">
      <Card className="w-full max-w-md p-8 space-y-8 shadow-xl">
        {/* Logo */}
        <div className="text-center space-y-2">
          <img
            src="/divit-icon.png"
            alt="Divit"
            className="w-16 h-16 rounded-2xl mx-auto shadow-lg"
          />
          <h1 className="text-3xl font-bold bg-gradient-to-r from-primary via-primary-glow to-accent bg-clip-text text-transparent">
            Divit
          </h1>
          <p className="text-muted-foreground">
            Split bills fairly with AI-powered receipt scanning
          </p>
        </div>

        {/* Sign In Buttons */}
        <div className="space-y-4">
          <ProviderSignInButtons
            onSignIn={handleSignIn}
            pendingProvider={pendingProvider}
            disabled={isClaiming}
          />

          <EmailPasswordForm disabled={isClaiming} />

          <p className="text-xs text-center text-muted-foreground">
            By signing in, you agree to our Terms of Service and Privacy Policy
          </p>
        </div>

        {/* Features */}
        <div className="pt-6 border-t space-y-3">
          <p className="text-sm font-medium text-center text-muted-foreground">
            Why sign in?
          </p>
          <ul className="space-y-2 text-sm text-muted-foreground">
            <li className="flex items-start">
              <span className="mr-2">✓</span>
              <span>Save and access your bill history</span>
            </li>
            <li className="flex items-start">
              <span className="mr-2">✓</span>
              <span>Share bills with friends</span>
            </li>
            <li className="flex items-start">
              <span className="mr-2">✓</span>
              <span>Sync across all your devices</span>
            </li>
          </ul>
        </div>
      </Card>
    </div>
  );
};

export default Auth;
