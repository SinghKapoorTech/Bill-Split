import { Heart, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Person } from '@/types';
import { UserVenmoIdEditor } from './UserVenmoIdEditor';

interface PersonCardProps {
    person: Person;
    isCurrentUser: boolean;
    isInFriends: boolean;
    onRemove: (personId: string) => void;
    onSaveAsFriend: (person: Person) => void;
}

/**
 * PersonCard Component
 * Displays a single person with their information and actions
 * Extracted from PeopleManager lines 312-366
 */
export function PersonCard({
    person,
    isCurrentUser,
    isInFriends,
    onRemove,
    onSaveAsFriend
}: PersonCardProps) {
    return (
        <div
            className={`flex items-center justify-between p-2 md:p-3 ${isCurrentUser
                    ? 'bg-primary/10 border border-primary/20'
                    : 'bg-secondary/50'
                }`}
        >
            <div className="flex-1">
                <div className="flex items-center gap-2">
                    <span className="text-sm md:text-base font-medium">{person.name}</span>
                    {isCurrentUser && (
                        <span className="px-2 py-0.5 text-xs font-semibold bg-primary text-primary-foreground rounded-full">
                            You
                        </span>
                    )}
                </div>
                {isCurrentUser ? (
                    <UserVenmoIdEditor currentVenmoId={person.venmoId} />
                ) : (
                    person.venmoId && (
                        <span className="ml-2 text-xs text-muted-foreground">
                            (@{person.venmoId.replace(/^@+/, '')})
                        </span>
                    )
                )}
            </div>
            <div className="flex gap-1">
                {!isCurrentUser && (
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => !isInFriends && onSaveAsFriend(person)}
                        title={isInFriends ? "Already a friend" : "Save as friend"}
                        className="hover:bg-transparent"
                        disabled={isInFriends}
                    >
                        <Heart className={`w-4 h-4 text-red-500 ${isInFriends ? 'fill-red-500' : ''}`} />
                    </Button>
                )}
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onRemove(person.id)}
                    title={isCurrentUser ? "Cannot remove yourself" : "Remove person"}
                    disabled={isCurrentUser}
                    className={isCurrentUser ? 'opacity-50 cursor-not-allowed' : ''}
                >
                    <Trash2 className="w-4 h-4 text-destructive" />
                </Button>
            </div>
        </div>
    );
}
