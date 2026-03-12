import { useState, useRef, useEffect, ReactNode } from 'react';
import { Loader2 } from 'lucide-react';

interface PullToRefreshProps {
  onRefresh: () => Promise<void>;
  children: ReactNode;
}

export function PullToRefresh({ onRefresh, children }: PullToRefreshProps) {
  const [startY, setStartY] = useState(0);
  const [currentY, setCurrentY] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const threshold = 80;

  const handleTouchStart = (e: React.TouchEvent) => {
    // Only allow pull to refresh when scrolled to the very top
    if (window.scrollY === 0) {
      setStartY(e.touches[0].clientY);
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (startY === 0) return;
    
    // Check again to ensure we don't interfere with normal scrolling
    if (window.scrollY === 0) {
      const y = e.touches[0].clientY;
      if (y > startY) {
        // Prevent default only when pulling down at the top
        // Needed to stop overscroll bounce on some browsers, but must be passive false
        // React synthetic events are passive by default for touchmove, so we handle it 
        // with CSS overscroll-behavior mostly, and just track state here
        setCurrentY(y - startY);
      }
    } else {
      setStartY(0);
      setCurrentY(0);
    }
  };

  const handleTouchEnd = async () => {
    if (currentY > threshold && !refreshing) {
      setRefreshing(true);
      try {
        await onRefresh();
      } finally {
        setRefreshing(false);
        setStartY(0);
        setCurrentY(0);
      }
    } else {
      setStartY(0);
      setCurrentY(0);
    }
  };

  // Add passive false listener for touchmove on mount to prevent browser refresh behavior
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const preventPullToRefresh = (e: TouchEvent) => {
      // Prevent browser default pull-to-refresh only when we are handling it
      if (window.scrollY === 0 && e.touches[0].clientY > startY && startY > 0) {
        if (e.cancelable) {
          e.preventDefault();
        }
      }
    };

    el.addEventListener('touchmove', preventPullToRefresh, { passive: false });
    return () => el.removeEventListener('touchmove', preventPullToRefresh);
  }, [startY]);

  const pullIndicatorHeight = Math.min(currentY * 0.5, threshold);
  
  return (
    <div 
      ref={containerRef}
      className="relative min-h-[calc(100vh-80px)]"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* Visual Pull Indicator */}
      <div 
        className="absolute top-0 left-0 right-0 flex justify-center items-center overflow-hidden transition-all duration-200"
        style={{ 
          height: refreshing ? `${threshold}px` : `${pullIndicatorHeight}px`,
          opacity: refreshing ? 1 : Math.min(currentY / threshold, 1)
        }}
      >
        <Loader2 
          className={`w-6 h-6 text-primary ${refreshing ? 'animate-spin' : ''}`} 
          style={{ 
            transform: !refreshing ? `rotate(${currentY * 2}deg)` : undefined 
          }}
        />
      </div>

      {/* Main Content wrapped in a div that moves down during pull */}
      <div 
        className="transition-transform duration-200 h-full"
        style={{ 
          transform: `translateY(${refreshing ? threshold : pullIndicatorHeight}px)` 
        }}
      >
        {children}
      </div>
    </div>
  );
}
