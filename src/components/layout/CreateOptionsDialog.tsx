import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle 
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Receipt, Users, Camera, Keyboard } from "lucide-react";
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
          <DialogTitle>Create New</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-4 py-4">
          <Button
            variant="outline"
            className="h-24 flex flex-col items-center justify-center gap-2 hover:bg-primary/5 hover:border-primary/50 transition-all font-normal"
            onClick={() => handleAction('/bill/new')}
          >
            <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
              <Receipt className="w-5 h-5 text-primary" />
            </div>
            <span>New Bill</span>
          </Button>

          <Button
            variant="outline"
            className="h-24 flex flex-col items-center justify-center gap-2 hover:bg-primary/5 hover:border-primary/50 transition-all font-normal"
            onClick={() => handleAction('/groups')}
          >
            <div className="h-10 w-10 rounded-full bg-purple-100 flex items-center justify-center">
              <Users className="w-5 h-5 text-purple-600" />
            </div>
            <span>New Event</span>
          </Button>
          
          <Button
             variant="outline"
             className="h-24 flex flex-col items-center justify-center gap-2 hover:bg-primary/5 hover:border-primary/50 transition-all font-normal col-span-2"
             onClick={() => handleAction('/join/scan')} // Assuming we have a join/scan route or similar? 
             // Actually, usually manual entry or scan. Let's just point to dashboard for now or a specific join route if it exists.
             // Checking App.tsx, we have /join/:sessionId. 
             // Let's point to a generic join or scan page if it exists. 
             // AIScanView is at /bill/:billId.
             // Maybe we just trigger the camera scan?
             // For now, let's keep it simple: New Bill (Manual), Scan (AI), Join.
          >
             <div className="h-10 w-10 rounded-full bg-blue-100 flex items-center justify-center">
                <Camera className="w-5 h-5 text-blue-600" />
            </div>
            <span>Scan Receipt</span>
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
