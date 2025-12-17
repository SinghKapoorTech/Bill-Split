import { Loader2 } from 'lucide-react';

export function LoadingScreen() {
  return (
    <div className="fixed inset-0 w-full h-full flex items-center justify-center bg-gradient-to-br from-cyan-50 via-blue-50 to-purple-50">
      <div className="text-center space-y-4">
        <Loader2 className="w-12 h-12 animate-spin text-cyan-500 mx-auto" />
        <p className="text-sm text-slate-600">Loading...</p>
      </div>
    </div>
  );
}
