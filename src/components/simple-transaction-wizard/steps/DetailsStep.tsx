import { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/contexts/AuthContext";
import { useUserProfile } from "@/hooks/useUserProfile";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DollarSign } from "lucide-react";

interface DetailsStepProps {
  amount: string;
  setAmount: (val: string) => void;
  title: string;
  setTitle: (val: string) => void;
}

export function DetailsStep({
  amount,
  setAmount,
  title,
  setTitle,
}: DetailsStepProps) {
  const { user } = useAuth();
  const { profile } = useUserProfile();
  
  // Format amount input
  const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let value = e.target.value.replace(/[^0-9.]/g, '');
    
    // Prevent multiple decimals
    const parts = value.split('.');
    if (parts.length > 2) {
      value = parts[0] + '.' + parts.slice(1).join('');
    }
    
    // Limit decimal places to 2
    if (parts[1] && parts[1].length > 2) {
      value = parts[0] + '.' + parts[1].slice(0, 2);
    }
    
    setAmount(value);
  };

  const friends = profile?.friends || [];

  return (
    <div className="flex flex-col gap-6 p-4 max-w-md mx-auto">
      <div className="text-center mb-2">
        <h2 className="text-2xl font-semibold">Expense Details</h2>
        <p className="text-muted-foreground text-sm">Enter the amount and description</p>
      </div>

      <div className="space-y-4">
        {/* Amount Input */}
        <div className="space-y-2">
          <Label htmlFor="amount" className="text-sm font-medium">Amount</Label>
          <div className="relative">
            <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground w-5 h-5" />
            <Input
              id="amount"
              type="text"
              inputMode="decimal"
              placeholder="0.00"
              value={amount}
              onChange={handleAmountChange}
              className="pl-10 text-2xl h-14 font-semibold text-center"
              autoFocus
            />
          </div>
        </div>

        {/* Title Input */}
        <div className="space-y-2">
          <Label htmlFor="title" className="text-sm font-medium">What was this for?</Label>
          <Input
            id="title"
            type="text"
            placeholder="e.g. Gas, Uber, Tickets..."
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="h-12"
          />
        </div>
      </div>
    </div>
  );
}
