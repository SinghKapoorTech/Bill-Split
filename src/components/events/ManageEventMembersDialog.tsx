import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Trash2 } from "lucide-react";
import { UserProfile } from '@/types/person.types';

interface ManageEventMembersDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  memberProfiles: Record<string, UserProfile>;
  memberIds: string[];
  ownerId: string;
  currentUserId: string;
  onRemoveMember: (memberId: string) => void;
  eventName: string;
}

export function ManageEventMembersDialog({
  open,
  onOpenChange,
  memberProfiles,
  memberIds,
  ownerId,
  currentUserId,
  onRemoveMember,
  eventName
}: ManageEventMembersDialogProps) {
  
  // Is the current user the owner of the event?
  const isOwner = currentUserId === ownerId;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Members</DialogTitle>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto pr-2 mt-4 space-y-4">
          {memberIds.map(memberId => {
            const profile = memberProfiles[memberId];
            const name = profile?.displayName || profile?.username || 'Unknown User';
            const isGroupOwner = memberId === ownerId;
            const isSelf = memberId === currentUserId;
            
            // Only the owner can remove members (but they cannot remove themselves here)
            const canRemove = isOwner && !isSelf;

            return (
              <div key={memberId} className="flex items-center justify-between p-2 rounded-lg hover:bg-muted/50 transition-colors">
                <div className="flex items-center gap-3">
                  <Avatar className="h-10 w-10">
                    <AvatarImage src={profile?.photoURL} />
                    <AvatarFallback>{name.charAt(0).toUpperCase()}</AvatarFallback>
                  </Avatar>
                  <div className="flex flex-col">
                    <span className="text-sm font-medium">
                      {name} {isSelf && "(You)"}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {isGroupOwner ? 'Owner' : 'Member'}
                    </span>
                  </div>
                </div>
                
                {canRemove && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-destructive hover:text-destructive hover:bg-destructive/10"
                    onClick={() => onRemoveMember(memberId)}
                    title="Remove member"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
