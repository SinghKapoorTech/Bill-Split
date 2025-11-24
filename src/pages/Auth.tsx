import { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Receipt, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useAuth } from '@/contexts/AuthContext';

const Auth = () => {
  const { user, loading, signInWithGoogle } = useAuth();
  const navigate = useNavigate();
  const [isSigningIn, setIsSigningIn] = useState(false);

  // Use sessionStorage to persist across potential app remounts on iOS
  const getInitialLoadState = () => {
    const stored = sessionStorage.getItem('auth_initial_load_complete');
    return stored !== 'true';
  };
  const [initialLoad, setInitialLoad] = useState(getInitialLoadState);

  // Redirect to home if already logged in
  useEffect(() => {
    if (user) {
      navigate('/scan');
    }
  }, [user, navigate]);

  // Mark initial load as complete after first render
  useEffect(() => {
    if (!loading && initialLoad) {
      setInitialLoad(false);
      sessionStorage.setItem('auth_initial_load_complete', 'true');
    }
  }, [loading, initialLoad]);

  // Handle sign-in
  const handleSignIn = async () => {
    sessionStorage.setItem('auth_initial_load_complete', 'true');
    setInitialLoad(false);
    setIsSigningIn(true);

    try {
      await signInWithGoogle();
    } catch (error: any) {
      console.error('[Auth] Sign-in error:', error);
    } finally {
      setIsSigningIn(false);
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
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary to-primary-glow flex items-center justify-center mx-auto shadow-lg">
            <Receipt className="w-9 h-9 text-primary-foreground" />
          </div>
          <h1 className="text-3xl font-bold bg-gradient-to-r from-primary via-primary-glow to-accent bg-clip-text text-transparent">
            SplitBill
          </h1>
          <p className="text-muted-foreground">
            Split bills fairly with AI-powered receipt scanning
          </p>
        </div>

        {/* Sign In Button */}
        <div className="space-y-4">
          <Button
            onClick={handleSignIn}
            disabled={isSigningIn}
            size="lg"
            className="w-full bg-white hover:bg-gray-50 text-gray-900 border border-gray-300 shadow-md hover:shadow-lg transition-all duration-300 disabled:opacity-50"
          >
            {isSigningIn ? (
              <>
                <Loader2 className="w-5 h-5 mr-3 animate-spin" />
                Signing in...
              </>
            ) : (
              <>
                <svg className="w-5 h-5 mr-3" viewBox="0 0 24 24">
                  <path
                    fill="#4285F4"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                  />
                </svg>
                Sign in with Google
              </>
            )}
          </Button>

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
