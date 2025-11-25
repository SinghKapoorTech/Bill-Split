import { createContext, useContext, ReactNode } from 'react';
import { useBills } from '@/hooks/useBills';

// Define the shape of the context data
type BillSessionContextType = ReturnType<typeof useBills>;

// Create the context
const BillSessionContext = createContext<BillSessionContextType | undefined>(undefined);

// Create the provider component
export function BillSessionProvider({ children }: { children: ReactNode }) {
  const billSessionManager = useBills();

  return (
    <BillSessionContext.Provider value={billSessionManager}>
      {children}
    </BillSessionContext.Provider>
  );
}

// Create a custom hook for easy consumption
export function useBillContext() {
  const context = useContext(BillSessionContext);
  if (context === undefined) {
    throw new Error('useBillContext must be used within a BillSessionProvider');
  }
  return context;
}
