import { useState, useRef, useEffect } from 'react';
import { UserPlus, Search, User, AtSign, Mail } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogDescription,
} from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';

interface Friend {
  id?: string;
  name: string;
  venmoId?: string;
  email?: string;
  username?: string;
}

interface AddPersonDialogProps {
  friendSuggestions: Friend[];
  onSearchChange: (value: string) => void;
  onSelectSuggestion: (friend: Friend) => void;
  onAddManual: (name: string, venmoId: string) => void;
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
}

export function AddPersonDialog({
  friendSuggestions,
  onSearchChange,
  onSelectSuggestion,
  onAddManual,
  isOpen,
  setIsOpen,
}: AddPersonDialogProps) {
  const [searchInput, setSearchInput] = useState('');
  
  // Manual Entry State
  const [manualName, setManualName] = useState('');
  const [manualVenmoId, setManualVenmoId] = useState('');

  // Focus ref for search input
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 50); // Small delay to ensure modal is rendered
      setSearchInput('');
      setManualName('');
      setManualVenmoId('');
      onSearchChange('');
    }
  }, [isOpen]);

  const handleSearchChange = (val: string) => {
    setSearchInput(val);
    onSearchChange(val);
    // Auto-fill manual name with search input if it doesn't match a suggestion
    setManualName(val);
  };

  const handleSelect = (friend: Friend) => {
    onSelectSuggestion(friend);
    setIsOpen(false);
  };

  const handleManualSubmit = () => {
    if (!manualName.trim()) return;
    onAddManual(manualName, manualVenmoId);
    setIsOpen(false);
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button className="w-full gap-2">
          <UserPlus className="w-4 h-4" />
          Add Person
        </Button>
      </DialogTrigger>
      
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Add Person</DialogTitle>
          <DialogDescription>
            Search for an app user, find a friend, or manually add a guest to the bill.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          {/* SEARCH AREA */}
          <div className="relative z-50">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              ref={inputRef}
              placeholder="Search by name, @username, or email..."
              className="pl-9"
              value={searchInput}
              onChange={(e) => handleSearchChange(e.target.value)}
            />

            {/* SUGGESTIONS DROPDOWN */}
            {searchInput.trim().length > 0 && friendSuggestions.length > 0 ? (
              <div className="absolute top-full left-0 right-0 mt-2 bg-popover border border-border rounded-md shadow-md flex flex-col overflow-hidden">
                <div className="px-3 py-2 bg-muted/50 border-b border-border">
                  <Label className="text-xs text-muted-foreground uppercase tracking-wider">Search Results</Label>
                </div>
                <ScrollArea className="max-h-[250px] w-full">
                  <div className="p-2">
                    {friendSuggestions.map((friend, idx) => (
                      <button
                        key={idx}
                        onClick={() => handleSelect(friend)}
                        className="w-full text-left flex flex-col p-3 rounded-md border border-border/40 bg-card hover:border-primary/30 hover:bg-accent/50 hover:shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all mb-2 cursor-pointer"
                      >
                        <div className="flex items-center gap-2 font-medium">
                          <User className="h-4 w-4 text-muted-foreground" />
                          {friend.name}
                        </div>

                        <div className="mt-2 grid grid-cols-1 gap-1 pl-6">
                          {friend.username && (
                            <div className="flex items-center gap-1.5 text-xs text-primary font-semibold">
                              <span className="text-muted-foreground font-normal">Username:</span>
                              @{friend.username}
                            </div>
                          )}
                          {friend.venmoId && (
                            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                              <AtSign className="h-3 w-3" />
                              <span className="font-medium text-foreground">@{friend.venmoId}</span> (Venmo)
                            </div>
                          )}
                          {friend.email && (
                            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                              <Mail className="h-3 w-3" />
                              {friend.email}
                            </div>
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                </ScrollArea>
              </div>
            ) : searchInput.trim().length > 0 ? (
               <div className="absolute top-full left-0 right-0 mt-2 bg-popover border border-border rounded-md shadow-md flex flex-col items-center justify-center p-6 text-center text-muted-foreground">
                  <User className="h-8 w-8 mb-2 opacity-50" />
                  <p className="text-sm">No users found.</p>
                  <p className="text-xs mt-1">You can add them as a guest below.</p>
               </div>
            ) : null}
          </div>

          <div className="relative py-2 z-0">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-background px-2 text-muted-foreground">Or</span>
            </div>
          </div>

          {/* MANUAL ADD AREA (Always shown at the bottom) */}
          <div className="flex flex-col gap-3 z-0">
              <Label className="text-xs text-muted-foreground uppercase tracking-wider">Add Guest Manually</Label>
              
              <Input
                  placeholder="Guest Name"
                  value={manualName}
                  onChange={(e) => setManualName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !manualVenmoId) {
                      handleManualSubmit();
                    }
                  }}
              />

              <div className="space-y-2">
                <Label htmlFor="manual-venmo-id">Venmo ID (optional)</Label>
                <div className="relative">
                  <AtSign className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="manual-venmo-id"
                    placeholder="Venmo ID (Optional)"
                    className="pl-9"
                    value={manualVenmoId}
                    onChange={(e) => {
                      let val = e.target.value;
                      if (val.startsWith('@')) {
                        val = val.substring(1);
                      }
                      setManualVenmoId(val);
                    }}
                    onKeyDown={(e) => e.key === 'Enter' && handleManualSubmit()}
                  />
                </div>
              </div>

              <Button onClick={handleManualSubmit} variant="default" disabled={!manualName.trim()} className="mt-2">
                Add Guest to Bill
              </Button>
          </div>

        </div>
      </DialogContent>
    </Dialog>
  );
}
