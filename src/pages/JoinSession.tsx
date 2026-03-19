import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';
import { useAuth } from '@/contexts/AuthContext';
import { useBillSession } from '@/hooks/useBillSession';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Users, AlertCircle, Smartphone, X } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Bill } from '@/types/bill.types';
import { billService } from '@/services/billService';

const APP_PACKAGE = 'com.singhkapoortech.divit';
const APP_SCHEME = 'divit';

function isAndroid(): boolean {
  return /Android/i.test(navigator.userAgent);
}

function isIOS(): boolean {
  return /iPhone|iPad|iPod/i.test(navigator.userAgent);
}

/**
 * Build an Android intent URI with a built-in browser fallback.
 * Chrome handles this natively — opens the app if installed,
 * redirects to fallbackUrl if not. No setTimeout hacks needed.
 */
function getAndroidIntentUri(path: string, fallbackUrl: string): string {
  return `intent://${path}#Intent;scheme=${APP_SCHEME};package=${APP_PACKAGE};S.browser_fallback_url=${encodeURIComponent(fallbackUrl)};end`;
}

/**
 * On iOS, Universal Links handle app-vs-web routing at the OS level.
 * If the app is installed + Associated Domains configured, tapping
 * the link opens the app. Otherwise, the web page loads normally.
 * As a fallback for when Universal Links aren't intercepted (e.g.
 * already in Safari on the same domain), we use the custom scheme.
 */
function getIOSDeepLink(sessionId: string, shareCode: string): string {
  return `${APP_SCHEME}://join/${sessionId}?code=${shareCode}`;
}

export default function JoinSession() {
  const navigate = useNavigate();
  const { sessionId } = useParams<{ sessionId: string }>();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();

  const [anonymousName, setAnonymousName] = useState('');
  const [shareCode, setShareCode] = useState(searchParams.get('code') || '');
  const [isValidating, setIsValidating] = useState(true);
  const [isJoining, setIsJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sessionData, setSessionData] = useState<Bill | null>(null);

  const [showAppBanner, setShowAppBanner] = useState(false);

  const shareCodeFromUrl = searchParams.get('code');
  const { joinSession } = useBillSession(sessionId || null);

  // Show "Open in App" banner for mobile web users (not inside the native app)
  useEffect(() => {
    if (!Capacitor.isNativePlatform() && (isAndroid() || isIOS())) {
      setShowAppBanner(true);
    }
  }, []);

  const handleOpenInApp = useCallback(() => {
    if (!sessionId) return;
    const code = shareCode || shareCodeFromUrl || '';
    const currentUrl = window.location.href;

    if (isAndroid()) {
      // Android intent URI: Chrome opens app if installed, fallback URL if not
      window.location.href = getAndroidIntentUri(
        `join/${sessionId}?code=${code}`,
        currentUrl
      );
    } else if (isIOS()) {
      // iOS: try custom scheme (Universal Links don't work for same-domain navigation)
      window.location.href = getIOSDeepLink(sessionId, code);
    }
  }, [sessionId, shareCode, shareCodeFromUrl]);

  // Validate session exists
  useEffect(() => {
    const validateSession = async () => {
      if (!sessionId) {
        setError('Invalid session link');
        setIsValidating(false);
        return;
      }

      try {
        const bill = await billService.getBill(sessionId);

        if (!bill) {
          setError('Session not found');
          setIsValidating(false);
          return;
        }

        // Check if session is ended (archived)
        if (bill.status === 'archived') {
          setError('This session has ended');
          setIsValidating(false);
          return;
        }

        // Auto-redirect logged-in users who are already in the bill
        if (user) {
          const prefixedId = `user-${user.uid}`;
          const alreadyInBill = bill.people?.find(
            p => p.id === user.uid || p.id === prefixedId
          ) || bill.members?.find(m => m.userId === user.uid);

          if (alreadyInBill) {
            navigate(`/shared/${sessionId}`, { replace: true });
            return;
          }
        }

        setSessionData(bill);
        setError(null);
        setIsValidating(false);
      } catch (err) {
        console.error('Error validating session:', err);
        setError('Could not validate session');
        setIsValidating(false);
      }
    };

    validateSession();
  }, [sessionId, shareCodeFromUrl, user, navigate]);

  const handleJoin = async () => {
    const name = user?.displayName || anonymousName.trim();
    if (!name) {
      setError('Please enter your name');
      return;
    }

    const enteredCode = shareCode.trim();
    if (!enteredCode) {
      setError('Please enter the share code');
      return;
    }

    // Validate share code against session data
    if (sessionData?.shareCode && sessionData.shareCode !== enteredCode) {
      setError('Invalid share code');
      return;
    }

    // Check if authenticated user already exists in either format
    const userId = user?.uid;
    const prefixedId = userId ? `user-${userId}` : null;

    const existingById = userId ? sessionData?.people?.find(
      p => p.id === userId || p.id === prefixedId
    ) : null;

    // Check for duplicate name (case-insensitive)
    const existingPerson = sessionData?.people?.find(
      p => p.name.toLowerCase() === name.toLowerCase()
    );

    if (existingById || existingPerson) {
      // If we already exist, ensure localStorage is set for anonymous users before navigating
      if (!user && existingPerson && sessionId) {
        // The ID might have a 'user-' prefix, we should store the raw ID
        const rawId = existingPerson.id.startsWith('user-') ? existingPerson.id.substring(5) : existingPerson.id;
        localStorage.setItem(`guest-id-${sessionId}`, rawId);
      }

      // Logged-in users go to the protected /shared route; anonymous users go to /session
      navigate(user ? `/shared/${sessionId}` : `/session/${sessionId}`);
      return;
    }

    setIsJoining(true);
    setError(null);

    try {
      const userId = await joinSession(anonymousName.trim(), enteredCode);

      // Store guestId in localStorage for anonymous users so they can be identified later
      if (!user && userId && sessionId) {
        localStorage.setItem(`guest-id-${sessionId}`, userId);
      }

      navigate(user ? `/shared/${sessionId}` : `/session/${sessionId}`);
    } catch (err) {
      console.error('Error joining session:', err);
      setError('Could not join session');
      setIsJoining(false);
    }
  };

  if (isValidating) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-background to-secondary/30">
        <div className="text-center space-y-4">
          <Loader2 className="w-12 h-12 animate-spin text-primary mx-auto" />
          <p className="text-muted-foreground">Validating session...</p>
        </div>
      </div>
    );
  }

  if (error && !sessionData) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-background to-secondary/30 p-4">
        <Card className="w-full max-w-md p-8 space-y-6">
          <div className="text-center space-y-2">
            <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center mx-auto">
              <AlertCircle className="w-8 h-8 text-destructive" />
            </div>
            <h1 className="text-2xl font-bold">Unable to Join</h1>
            <p className="text-muted-foreground">{error}</p>
          </div>
          <Button onClick={() => navigate('/')} className="w-full">
            Go to Landing Page
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-background to-secondary/30 p-4">
      <Card className="w-full max-w-md p-8 space-y-6">
        {/* Open in App Banner */}
        {showAppBanner && (
          <div className="flex items-center gap-3 p-3 -mt-2 rounded-lg bg-primary/10 border border-primary/20">
            <Smartphone className="w-5 h-5 text-primary shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium">Have the app?</p>
              <button
                onClick={handleOpenInApp}
                className="text-sm text-primary font-semibold hover:underline"
              >
                Open in Bill Split
              </button>
            </div>
            <button
              onClick={() => setShowAppBanner(false)}
              className="p-1 rounded-md hover:bg-secondary/50 text-muted-foreground"
              aria-label="Dismiss"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Header */}
        <div className="text-center space-y-2">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary to-primary-glow flex items-center justify-center mx-auto shadow-lg">
            <Users className="w-9 h-9 text-primary-foreground" />
          </div>
          <h1 className="text-3xl font-bold">Join Collaborative Session</h1>
          <p className="text-muted-foreground">
            {sessionData?.people.length || 0} {sessionData?.people.length === 1 ? 'person' : 'people'} already in this session
          </p>
        </div>

        {/* Session Info */}
        {sessionData?.billData && (
          <div className="p-4 bg-secondary/50 rounded-lg space-y-1">
            <p className="font-semibold">{sessionData.billData.restaurantName || 'Unnamed Bill'}</p>
            {sessionData.billData.items && sessionData.billData.items.length > 0 && (
              <p className="text-sm text-muted-foreground">
                {sessionData.billData.items.length} items • ${sessionData.billData.total?.toFixed(2) || '0.00'}
              </p>
            )}
          </div>
        )}

        {/* Error Message */}
        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* Anonymous Name Input (if not signed in) */}
        {!user && (
          <div className="space-y-2">
            <Label htmlFor="anonymous-name">Your Name</Label>
            <Input
              id="anonymous-name"
              placeholder="Enter your name"
              value={anonymousName}
              onChange={(e) => {
                setAnonymousName(e.target.value);
                setError(null);
              }}
              onKeyDown={(e) => e.key === 'Enter' && handleJoin()}
              className={error === 'Please enter your name' ? 'border-destructive' : ''}
            />
          </div>
        )}

        {/* Share Code Input */}
        <div className="space-y-2">
          <Label htmlFor="share-code">Share Code</Label>
          <Input
            id="share-code"
            placeholder="Enter 6-character share code"
            value={shareCode}
            onChange={(e) => {
              setShareCode(e.target.value.toUpperCase());
              setError(null);
            }}
            onKeyDown={(e) => e.key === 'Enter' && handleJoin()}
            maxLength={6}
            className={error === 'Invalid share code' || error === 'Please enter the share code' ? 'border-destructive' : ''}
          />
          <p className="text-xs text-muted-foreground">
            The 6-character code shared by the session host
          </p>
        </div>

        {/* Join Button */}
        <div className="space-y-3">
          <Button
            onClick={handleJoin}
            disabled={isJoining || !shareCode.trim() || (!user && !anonymousName.trim())}
            className="w-full"
            size="lg"
          >
            {isJoining ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Joining...
              </>
            ) : (
              'Join Session'
            )}
          </Button>

          <Button onClick={() => navigate('/')} variant="outline" className="w-full">
            Back to Home
          </Button>
        </div>

        {/* Sign In Prompt */}
        {!user && (
          <div className="pt-4 border-t text-center text-sm text-muted-foreground">
            <p>
              Want to save your session history?{' '}
              <button
                onClick={() => navigate('/auth')}
                className="text-primary hover:underline font-medium"
              >
                Sign in
              </button>
            </p>
          </div>
        )}
      </Card>
    </div>
  );
}
