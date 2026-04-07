import { LayoutDashboard } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';

function DivitIcon({ className }: { className?: string }) {
  // Jagged tear line coordinates (irregular rip across the middle)
  const tearY = [48, 44, 50, 43, 52, 46, 49, 42, 51, 45, 48];
  const tearX = [18, 24, 30, 36, 42, 50, 56, 62, 68, 74, 80];

  // Build top half: jagged top edge → right side down to tear → tear line back left → left side up
  const topPath = `M18,12 L23,17 L28,12 L33,17 L38,12 L43,17 L48,12 L53,17 L58,12 L63,17 L68,12 L73,17 L80,12
    L80,${tearY[10]} ${tearX.map((x, i) => `L${x},${tearY[i]}`).reverse().join(' ')} Z`;

  // Build bottom half: tear line left to right → right side down → jagged bottom edge → left side up
  const bottomPath = `${tearX.map((x, i) => `${i === 0 ? 'M' : 'L'}${x},${tearY[i]}`).join(' ')}
    L80,${tearY[10]} L80,88 L73,83 L68,88 L63,83 L58,88 L53,83 L48,88 L43,83 L38,88 L33,83 L28,88 L23,83 L18,88 L18,${tearY[0]} Z`;

  return (
    <svg viewBox="0 0 100 100" className={className} xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="header-icon-bg" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#3948d0" />
          <stop offset="100%" stopColor="#707bdb" />
        </linearGradient>
      </defs>
      <rect width="100" height="100" rx="22" fill="url(#header-icon-bg)" />
      {/* Top half - shifted up-left and rotated */}
      <g transform="translate(-3, -3) rotate(-2, 50, 30)">
        <clipPath id="header-top-clip">
          <path d={topPath} />
        </clipPath>
        <path d={topPath} fill="white" fillOpacity="0.95" />
        <text x="49" y="60" textAnchor="middle" fontFamily="Arial, sans-serif" fontWeight="bold" fontSize="36" fill="#3948d0" clipPath="url(#header-top-clip)">$</text>
      </g>
      {/* Bottom half - shifted down-right and rotated */}
      <g transform="translate(3, 3) rotate(2, 50, 70)">
        <clipPath id="header-bottom-clip">
          <path d={bottomPath} />
        </clipPath>
        <path d={bottomPath} fill="white" fillOpacity="0.90" />
        <text x="49" y="60" textAnchor="middle" fontFamily="Arial, sans-serif" fontWeight="bold" fontSize="36" fill="#707bdb" clipPath="url(#header-bottom-clip)">$</text>
      </g>
    </svg>
  );
}

export function LandingHeader() {
  const navigate = useNavigate();
  const { user } = useAuth();

  return (
    <header className="sticky top-0 z-50 w-full border-b border-slate-200/20 bg-transparent backdrop-blur-md">
      <div className="container mx-auto px-8 py-4">
        <div className="flex items-center justify-between max-w-7xl mx-auto">
          {/* Logo */}
          <div className="flex items-center gap-3 cursor-pointer" onClick={() => navigate('/')}>
            <DivitIcon className="w-10 h-10 rounded-xl shadow-lg" />
            <h1 className="text-2xl font-bold bg-gradient-to-r from-indigo-500 to-violet-500 bg-clip-text text-transparent">
              Divit
            </h1>
          </div>

          {/* Conditional Button */}
          {user ? (
            <Button
              onClick={() => navigate('/dashboard')}
              className="bg-gradient-to-r from-indigo-500 to-violet-500 text-white font-semibold px-6 py-2 shadow-lg hover:shadow-xl hover:scale-105 transition-all duration-300 border-0 gap-2"
            >
              <LayoutDashboard className="w-4 h-4" />
              Dashboard
            </Button>
          ) : (
            <Button
              onClick={() => navigate('/auth')}
              className="bg-gradient-to-r from-indigo-500 to-violet-500 text-white font-semibold px-6 py-2 shadow-lg hover:shadow-xl hover:scale-105 transition-all duration-300 border-0"
            >
              Sign In
            </Button>
          )}
        </div>
      </div>
    </header>
  );
}

