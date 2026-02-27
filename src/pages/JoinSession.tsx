import { useState, useEffect } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useBillSession } from '@/hooks/useBillSession';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Users, AlertCircle } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Bill } from '@/types/bill.types';
import { billService } from '@/services/billService';

export default function JoinSession() {
  const navigate = useNavigate();
  const { sessionId } = useParams<{ sessionId: string }>();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();

  const [anonymousName, setAnonymousName] = useState('');
  const [isValidating, setIsValidating] = useState(true);
  const [isJoining, setIsJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sessionData, setSessionData] = useState<Bill | null>(null);

  const shareCodeFromUrl = searchParams.get('code');
  const { joinSession } = useBillSession(sessionId || null);

  // Validate session and share code
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

        // Validate share code
        if (shareCodeFromUrl && bill.shareCode !== shareCodeFromUrl) {
          setError('Invalid share code');
          setIsValidating(false);
          return;
        }

        // Check if session is ended (archived)
        if (bill.status === 'archived') {
          setError('This session has ended');
          setIsValidating(false);
          return;
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
  }, [sessionId, shareCodeFromUrl]);

  const handleJoin = async () => {
    const name = user?.displayName || anonymousName.trim();
    
    if (!name) {
      setError('Please enter your name');
      return;
    }

    // Check for duplicate name (case-insensitive)
    const existingPerson = sessionData?.people?.find(
      p => p.name.toLowerCase() === name.toLowerCase()
    );
    
    if (existingPerson) {
      setError(`"${existingPerson.name}" is already on this bill. Please use a different name.`);
      return;
    }

    setIsJoining(true);
    setError(null);

    try {
      const userId = await joinSession(anonymousName.trim());
      
      // Store guestId in localStorage for anonymous users so they can be identified later
      if (!user && userId && sessionId) {
        localStorage.setItem(`guest-id-${sessionId}`, userId);
      }
      
      // Navigate to the collaborative session view
      navigate(`/session/${sessionId}`);
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
        {/* Header */}
        <div className="text-center space-y-2">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary to-primary-glow flex items-center justify-center mx-auto shadow-lg">
            <Users className="w-9 h-9 text-primary-foreground" />
          </div>
          <h1 className="text-3xl font-bold">Join Collaborative Session</h1>
          <p className="text-muted-foreground">
            {sessionData?.members.length || 0} {sessionData?.members.length === 1 ? 'person' : 'people'} already in this session
          </p>
        </div>

        {/* Session Info */}
        {sessionData?.billData && (
          <div className="p-4 bg-secondary/50 rounded-lg space-y-1">
            <p className="text-sm text-muted-foreground">Restaurant/Bill</p>
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
                setError(null); // Clear error when typing
              }}
              onKeyDown={(e) => e.key === 'Enter' && handleJoin()}
              className={error ? 'border-destructive' : ''}
            />
            <p className="text-xs text-muted-foreground">
              This will be displayed to other participants
            </p>
          </div>
        )}

        {/* Join Button */}
        <div className="space-y-3">
          <Button
            onClick={handleJoin}
            disabled={isJoining || (!user && !anonymousName.trim())}
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
