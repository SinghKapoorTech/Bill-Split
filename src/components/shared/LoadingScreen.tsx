import { Loader2 } from 'lucide-react';

export function LoadingScreen() {
  return (
    <div className="fixed inset-0 w-full h-full flex items-center justify-center bg-gradient-to-b from-background to-secondary/30">
      <div className="text-center space-y-4">
        <Loader2 className="w-12 h-12 animate-spin text-primary mx-auto" />
        <p className="text-sm text-muted-foreground">Loading...</p>
      </div>
    </div>
  );
}

