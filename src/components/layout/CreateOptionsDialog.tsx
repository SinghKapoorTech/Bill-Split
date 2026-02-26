import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Receipt, Zap } from "lucide-react";
import { useNavigate } from "react-router-dom";

interface CreateOptionsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CreateOptionsDialog({ open, onOpenChange }: CreateOptionsDialogProps) {
  const navigate = useNavigate();
  const handleAction = (path: string) => {
    navigate(path);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-center text-xl font-bold pb-2">Create New</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3 py-2">
          <button
            className="group relative flex items-center gap-4 p-4 rounded-2xl border border-border/40 bg-card hover:bg-primary/[0.03] hover:border-primary/30 transition-all duration-300 text-left overflow-hidden shadow-sm hover:shadow-md active:scale-[0.98]"
            onClick={() => handleAction('/bill/new')}
          >
            <div className="absolute inset-0 bg-gradient-to-r from-primary/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />
            <div className="relative flex-shrink-0 h-12 w-12 rounded-2xl bg-primary/10 text-primary flex items-center justify-center group-hover:scale-110 group-hover:rotate-3 transition-transform duration-300 shadow-sm">
              <Receipt className="w-6 h-6" />
            </div>
            <div className="flex flex-col relative z-10">
              <span className="font-semibold text-foreground text-base group-hover:text-primary transition-colors">New Bill</span>
              <span className="text-sm text-muted-foreground mt-0.5">Split a detailed expense with friends</span>
            </div>
          </button>

          <button
            className="group relative flex items-center gap-4 p-4 rounded-2xl border border-border/40 bg-card hover:bg-amber-500/[0.03] hover:border-amber-500/30 transition-all duration-300 text-left overflow-hidden shadow-sm hover:shadow-md active:scale-[0.98]"
            onClick={() => handleAction('/transaction/new')}
          >
            <div className="absolute inset-0 bg-gradient-to-r from-amber-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />
            <div className="relative flex-shrink-0 h-12 w-12 rounded-2xl bg-amber-100 text-amber-600 flex items-center justify-center group-hover:scale-110 group-hover:-rotate-3 transition-transform duration-300 shadow-sm">
              <Zap className="w-6 h-6" />
            </div>
            <div className="flex flex-col relative z-10">
              <span className="font-semibold text-foreground text-base group-hover:text-amber-600 transition-colors">Quick Expense</span>
              <span className="text-sm text-muted-foreground mt-0.5">Record a fast, simple transaction</span>
            </div>
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
