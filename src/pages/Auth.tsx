import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { useAuth } from '@/contexts/AuthContext';
import { ProviderSignInButtons } from '@/components/auth/ProviderSignInButtons';
import type { SignInProvider } from '@/utils/authProviders';

const Auth = () => {
  const { user, loading, signIn } = useAuth();
  const navigate = useNavigate();
  const [pendingProvider, setPendingProvider] = useState<SignInProvider | null>(null);
  const [isClaiming, setIsClaiming] = useState(false);

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
      localStorage.setItem('pending_claim_guest_id', claimGuestId);
    }
    if (returnTo) {
      localStorage.setItem('pending_auth_return_to', returnTo);
    }
  }, []);

  // Redirect to home if already logged in, handling shadow user claims first
  useEffect(() => {
    const processUserAndRedirect = async () => {
      if (user) {
        const pendingClaimId = localStorage.getItem('pending_claim_guest_id');
        
        if (pendingClaimId) {
          try {
            setIsClaiming(true);
            const { billService } = await import('@/services/billService');
            await billService.claimShadowUser(pendingClaimId);
            localStorage.removeItem('pending_claim_guest_id');
          } catch (error) {
            console.error('Error claiming shadow user:', error);
          } finally {
            setIsClaiming(false);
          }
        }

        const returnTo = localStorage.getItem('pending_auth_return_to');
        localStorage.removeItem('pending_auth_return_to');
        navigate(returnTo || '/dashboard');
      }
    };

    processUserAndRedirect();
  }, [user, navigate]);

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
