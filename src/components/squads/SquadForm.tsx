import { useState, useEffect, useRef } from 'react';
import { X, UserPlus, Mail, Phone, Ticket } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { SquadMember } from '@/types/squad.types';
import { sanitizeSquadMember } from '@/utils/squadUtils';
import { useAuth } from '@/contexts/AuthContext';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/config/firebase';
import { userService } from '@/services/userService';
import { useFriendSearch } from '@/hooks/useFriendSearch';
import { Search, User } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';

interface SquadFormProps {
  initialName?: string;
  initialDescription?: string;
  initialMembers?: SquadMember[];
  onSubmit: (name: string, description: string, members: SquadMember[]) => void;
  submitLabel?: string;
}

export function SquadForm({
  initialName = '',
  initialDescription = '',
  initialMembers = [],
  onSubmit,
  submitLabel = 'Create Squad',
}: SquadFormProps) {
  const [name, setName] = useState(initialName);
  const [description, setDescription] = useState(initialDescription);
  const [members, setMembers] = useState<SquadMember[]>(initialMembers);
  
  // New member inputs
  const [newMemberName, setNewMemberName] = useState('');
  const [newMemberEmail, setNewMemberEmail] = useState('');
  const [newMemberPhone, setNewMemberPhone] = useState('');
  const [newMemberVenmoId, setNewMemberVenmoId] = useState('');
  
  const [showExtraFields, setShowExtraFields] = useState(false);
  
  const { filteredFriends, showSuggestions, setShowSuggestions } = useFriendSearch(newMemberName);

  const handleAddMember = () => {
    if (!newMemberName.trim()) return;

    const newMember: SquadMember = sanitizeSquadMember({
      name: newMemberName,
      email: newMemberEmail.trim() || undefined,
      phoneNumber: newMemberPhone.trim() || undefined,
      venmoId: newMemberVenmoId.replace(/^@+/, '').trim() || undefined,
    });

    // Check for duplicates
    // A simplified check mainly on name or if contact info matches
    const isDuplicate = members.some(
      (member) =>
        (member.name.toLowerCase() === newMember.name.toLowerCase()) ||
        (member.email && newMember.email && member.email.toLowerCase() === newMember.email.toLowerCase()) ||
        (member.phoneNumber && newMember.phoneNumber && member.phoneNumber === newMember.phoneNumber)
    );

    if (!isDuplicate) {
      setMembers([...members, newMember]);
    }

    setNewMemberName('');
    setNewMemberEmail('');
    setNewMemberPhone('');
    setNewMemberVenmoId('');
    setShowExtraFields(false);
  };

  const handleRemoveMember = (index: number) => {
    setMembers(members.filter((_, i) => i !== index));
  };

  const handleSubmit = () => {
    onSubmit(name, description, members);
  };

  const isValid = name.trim().length > 0 && members.length >= 2;

  return (
    <div className="space-y-4">
      <SquadNameField value={name} onChange={setName} />
      <SquadDescriptionField value={description} onChange={setDescription} />
      
      <div className="space-y-2">
        <Label>Members *</Label>
        <div className="border border-border rounded-md p-3 space-y-3 bg-card">
          <div className="space-y-3">
             <div className="flex gap-2">
                <div className="relative flex-1">
                  <Input
                    placeholder="Search for users or type guest name..."
                    value={newMemberName}
                    onChange={(e) => setNewMemberName(e.target.value)}
                    className="w-full"
                  />
                  {showSuggestions && filteredFriends.length > 0 && (
                     <div className="absolute top-full left-0 right-0 mt-2 bg-popover border border-border rounded-md shadow-md flex flex-col overflow-hidden z-50">
                       <div className="px-3 py-2 bg-muted/50 border-b border-border">
                         <Label className="text-xs text-muted-foreground uppercase tracking-wider">Search Results</Label>
                       </div>
                       <ScrollArea className="max-h-[200px] w-full">
                         <div className="p-2">
                           {filteredFriends.map((friend, idx) => (
                             <button
                               key={idx}
                               type="button"
                               onClick={() => {
                                 const newMember: SquadMember = {
                                    id: friend.id,
                                    name: friend.name,
                                    email: friend.email,
                                    venmoId: friend.venmoId
                                 };
                                 const isDuplicate = members.some(m => (m.id && m.id === newMember.id) || m.name.toLowerCase() === newMember.name.toLowerCase());
                                 if (!isDuplicate) setMembers([...members, newMember]);
                                 setNewMemberName('');
                                 setNewMemberEmail('');
                                 setNewMemberPhone('');
                                 setNewMemberVenmoId('');
                                 setShowSuggestions(false);
                               }}
                               className="w-full text-left flex items-center p-2 rounded-md border border-border/40 bg-card hover:border-primary/30 hover:bg-accent/50 hover:shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all mb-1.5 cursor-pointer h-12"
                             >
                               <div className="flex items-center justify-center h-8 w-8 rounded-full bg-primary/10 mr-3 flex-shrink-0">
                                 <User className="h-4 w-4 text-primary" />
                               </div>
                               <div className="flex flex-col flex-1 overflow-hidden">
                                 <span className="text-sm font-medium truncate">{friend.name}</span>
                                 {friend.username && (
                                   <span className="text-xs text-muted-foreground truncate">
                                     @{friend.username}
                                   </span>
                                 )}
                               </div>
                             </button>
                           ))}
                         </div>
                       </ScrollArea>
                     </div>
                  )}
                </div>
                <Button onClick={handleAddMember} variant="secondary" size="icon" type="button" disabled={!newMemberName.trim()}>
                  <UserPlus className="w-4 h-4" />
                </Button>
             </div>
             
             {!showExtraFields ? (
                <div className="flex gap-2">
                    <Button variant="ghost" size="sm" onClick={() => setShowExtraFields(true)} className="text-xs text-muted-foreground h-auto py-1">
                        + Add Guest Contact Info (Email/Phone/Venmo)
                    </Button>
                </div>
             ) : (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 animate-in fade-in slide-in-from-top-1">
                    <div className="relative">
                        <Mail className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                        <Input 
                            placeholder="Email" 
                            className="pl-9 text-xs" 
                            value={newMemberEmail}
                            onChange={(e) => setNewMemberEmail(e.target.value)}
                        />
                    </div>
                    <div className="relative">
                        <Phone className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                        <Input 
                            placeholder="Phone" 
                            className="pl-9 text-xs" 
                            value={newMemberPhone}
                            onChange={(e) => setNewMemberPhone(e.target.value)}
                        />
                    </div>
                    <div className="relative">
                        <Ticket className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                        <Input 
                            placeholder="Venmo ID" 
                            className="pl-9 text-xs" 
                            value={newMemberVenmoId}
                            onChange={(e) => setNewMemberVenmoId(e.target.value)}
                        />
                    </div>
                </div>
             )}
          </div>

          {members.length > 0 && (
            <div className="space-y-1 pt-2 max-h-[200px] overflow-y-auto">
              <Label className="text-xs text-muted-foreground">Current Members</Label>
              {members.map((member, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between p-2 bg-secondary/30 rounded text-sm"
                >
                  <div className="flex flex-col">
                    <span className="font-medium">{member.name}</span>
                    <div className="flex gap-2 text-xs text-muted-foreground">
                        {member.email && <span className="flex items-center gap-0.5"><Mail className="w-3 h-3"/> {member.email}</span>}
                        {member.phoneNumber && <span className="flex items-center gap-0.5"><Phone className="w-3 h-3"/> {member.phoneNumber}</span>}
                        {member.venmoId && <span className="flex items-center gap-0.5"><Ticket className="w-3 h-3"/> {member.venmoId}</span>}
                        {!member.email && !member.phoneNumber && !member.venmoId && <span>No contact info</span>}
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleRemoveMember(index)}
                    type="button"
                    className="h-8 w-8 p-0"
                  >
                    <X className="w-4 h-4 text-muted-foreground" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <Button onClick={handleSubmit} variant="success" disabled={!isValid} className="w-full">
        {submitLabel}
      </Button>
      {!isValid && members.length < 2 && (
        <p className="text-xs text-muted-foreground text-center">
          Add at least 2 members to create a squad
        </p>
      )}
    </div>
  );
}

interface SquadNameFieldProps {
  value: string;
  onChange: (value: string) => void;
}

function SquadNameField({ value, onChange }: SquadNameFieldProps) {
  return (
    <div className="space-y-2">
      <Label htmlFor="squad-name">Squad Name *</Label>
      <Input
        id="squad-name"
        placeholder="e.g., College Friends, Roommates"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        maxLength={50}
      />
    </div>
  );
}

interface SquadDescriptionFieldProps {
  value: string;
  onChange: (value: string) => void;
}

function SquadDescriptionField({ value, onChange }: SquadDescriptionFieldProps) {
  return (
    <div className="space-y-2">
      <Label htmlFor="squad-description">Description (Optional)</Label>
      <Textarea
        id="squad-description"
        placeholder="Add details about this squad..."
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={2}
      />
    </div>
  );
}

