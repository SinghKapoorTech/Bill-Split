import { useState } from 'react';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
    DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Person } from '@/types';
import { useToast } from '@/hooks/use-toast';

interface SaveFriendDialogProps {
    isOpen: boolean;
    onClose: () => void;
    person: Person;
    onSave: (contactInfo: string) => void;
}

export function SaveFriendDialog({ isOpen, onClose, person, onSave }: SaveFriendDialogProps) {
    const [contactInfo, setContactInfo] = useState('');
    const { toast } = useToast();

    const handleSave = () => {
        const trimmed = contactInfo.trim();
        if (!trimmed) {
            toast({
                title: 'Contact info required',
                description: 'Please provide an email or phone number.',
                variant: 'destructive',
            });
            return;
        }
        
        // Basic validation for email or phone
        const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed);
        const isPhone = /^[\+0-9\-\(\)\s]{7,20}$/.test(trimmed);

        if (!isEmail && !isPhone) {
            toast({
                title: 'Invalid format',
                description: 'Please enter a valid email or phone number.',
                variant: 'destructive',
            });
            return;
        }

        onSave(trimmed);
        setContactInfo('');
        onClose();
    };

    return (
        <Dialog open={isOpen} onOpenChange={(open) => {
            if (!open) {
                setContactInfo('');
                onClose();
            }
        }}>
            <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle>Save {person.name} as Friend</DialogTitle>
                    <DialogDescription>
                        To save this manually added person to your friends list, please provide their email or phone number.
                        If they are already registered, it will link to their account.
                    </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                    <div className="flex flex-col gap-2">
                        <Label htmlFor="contactInfo">Email or Phone Number</Label>
                        <Input
                            id="contactInfo"
                            placeholder="john@example.com or 1234567890"
                            value={contactInfo}
                            onChange={(e) => setContactInfo(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                    handleSave();
                                }
                            }}
                        />
                    </div>
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={onClose}>Cancel</Button>
                    <Button onClick={handleSave}>Save Friend</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
