import { useEffect } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { getAuthGate } from '@/utils/authGate';
import { Loader2 } from 'lucide-react';

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const { toast } = useToast();
  const location = useLocation();

  // 'loading' while auth is still resolving (incl. the `user === undefined`
  // window) so we never redirect an authenticated user mid-restore.
  const decision = getAuthGate(loading, user);

  useEffect(() => {
    // Show toast only once auth has genuinely resolved to no user.
    if (decision === 'redirect') {
      toast({
        title: 'Authentication Required',
        description: 'Please sign in to access this page.',
        variant: 'default',
      });
    }
  }, [decision, toast]);

  // Show loading spinner while determining auth state
  if (decision === 'loading') {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="w-12 h-12 animate-spin text-primary" />
      </div>
    );
  }

  // Redirect to landing page if not authenticated
  if (decision === 'redirect') {
    return <Navigate to="/" replace state={{ from: location }} />;
  }

  // Render protected content
  return <>{children}</>;
}
