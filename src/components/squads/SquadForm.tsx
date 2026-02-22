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
                <Input
                  placeholder="Name"
                  value={newMemberName}
                  onChange={(e) => setNewMemberName(e.target.value)}
                  className="flex-1"
                />
                <Button onClick={handleAddMember} variant="secondary" size="icon" type="button" disabled={!newMemberName.trim()}>
                  <UserPlus className="w-4 h-4" />
                </Button>
             </div>
             
             {!showExtraFields ? (
                <div className="flex gap-2">
                    <Button variant="ghost" size="sm" onClick={() => setShowExtraFields(true)} className="text-xs text-muted-foreground h-auto py-1">
                        + Add Contact Info (Email/Phone/Venmo)
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

          <ValidMemberUserSearch 
            onSelect={(user) => {
                 setNewMemberName(user.displayName);
                 setNewMemberEmail(user.email || '');
                 setNewMemberPhone(user.phoneNumber || '');
                 setNewMemberVenmoId(user.venmoId || '');
                 // Auto add? Or just populate fields? Populating fields is safer to review.
                 // Actually, if selected from existing friend/user, we should attach the ID directly if possible?
                 // SquadMember has optional `id`.
                 // Let's populate fields and let user click add.
            }}
          />

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
        autoFocus
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

// Simplified version of the friend search just to populate name/contact
function ValidMemberUserSearch({ onSelect }: { onSelect: (user: any) => void }) {
    const { user } = useAuth();
    const [friends, setFriends] = useState<any[]>([]);
    
    useEffect(() => {
        if (!user) return;
        const loadFriends = async () => {
             try {
                const hydratedFriends = await userService.getHydratedFriends(user.uid);
                setFriends(hydratedFriends);
             } catch (error) {
                console.error("Failed to load friends for squad form", error);
             }
        };
        loadFriends();
    }, [user]);
    
    if (friends.length === 0) return null;

    return (
        <div className="pt-2">
             <Label className="text-xs text-muted-foreground mb-1 block">Quick Add Friend</Label>
             <div className="flex gap-1 flex-wrap">
                 {friends.slice(0, 5).map((f, i) => (
                     <Badge key={i} variant="outline" className="cursor-pointer hover:bg-secondary" onClick={() => onSelect({ displayName: f.name, venmoId: f.venmoId })}>
                        {f.name}
                     </Badge>
                 ))}
             </div>
        </div>
    );
}
