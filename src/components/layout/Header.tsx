import { Receipt } from 'lucide-react';
import { AuthButton } from '@/components/AuthButton';
import { NavigationBar } from './NavigationBar';

export function Header() {
  return (
    <header className="border-b bg-card/50 backdrop-blur-sm sticky top-0 z-10">
      <div className="container mx-auto px-4 py-3 md:py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 md:w-10 md:h-10 rounded-xl bg-gradient-to-br from-primary to-primary-glow flex items-center justify-center">
              <Receipt className="w-5 h-5 md:w-6 md:h-6 text-primary-foreground" />
            </div>
            <h1 className="text-xl md:text-2xl font-bold">ChipMates</h1>
          </div>
          <div className="flex items-center gap-6">
            <NavigationBar />
            <AuthButton />
          </div>
        </div>
      </div>
    </header>
  );
}
