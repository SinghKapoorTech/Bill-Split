import { LayoutDashboard } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';

export function LandingHeader() {
  const navigate = useNavigate();
  const { user } = useAuth();

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border/20 bg-transparent backdrop-blur-md">
      <div className="container mx-auto px-8 py-4">
        <div className="flex items-center justify-between max-w-7xl mx-auto">
          {/* Logo */}
          <div className="flex items-center gap-3 cursor-pointer" onClick={() => navigate('/')}>
            <img src="/divit-icon.png" alt="Divit" className="w-10 h-10 rounded-xl shadow-lg" />
            <h1 className="text-2xl font-bold bg-gradient-to-r from-amber-600 to-yellow-500 bg-clip-text text-transparent">
              Divit
            </h1>
          </div>

          {/* Conditional Button */}
          {user ? (
            <Button
              onClick={() => navigate('/dashboard')}
              className="bg-primary text-primary-foreground font-semibold px-6 py-2 shadow-lg hover:shadow-xl hover:scale-105 transition-all duration-300 border-0 gap-2"
            >
              <LayoutDashboard className="w-4 h-4" />
              Dashboard
            </Button>
          ) : (
            <Button
              onClick={() => navigate('/auth')}
              className="bg-primary text-primary-foreground font-semibold px-6 py-2 shadow-lg hover:shadow-xl hover:scale-105 transition-all duration-300 border-0"
            >
              Sign In
            </Button>
          )}
        </div>
      </div>
    </header>
  );
}

