import { useEffect } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { Loader2 } from 'lucide-react';

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const { toast } = useToast();
  const location = useLocation();

  useEffect(() => {
    // Show toast when redirecting unauthenticated users
    if (!loading && !user) {
      toast({
        title: 'Authentication Required',
        description: 'Please sign in to access this page.',
        variant: 'default',
      });
    }
  }, [loading, user, toast]);

  // Show loading spinner while determining auth state
  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="w-12 h-12 animate-spin text-primary" />
      </div>
    );
  }

  // Redirect to landing page if not authenticated
  if (!user) {
    return <Navigate to="/" replace state={{ from: location }} />;
  }

  // Render protected content
  return <>{children}</>;
}
