import { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Person, BillData, ItemAssignment } from '@/types';
import { Plus, User, UserX, UserPlus, Save, UserCheck, Users } from 'lucide-react';
import { StepFooter } from '@/components/shared/StepFooter';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { usePeopleManager } from '@/hooks/usePeopleManager';
import { AddFromFriendsDialog } from '@/components/people/AddFromFriendsDialog';
import { AddPersonDialog } from '@/components/people/AddPersonDialog';
import { AddFromSquadDialog } from '@/components/squads/AddFromSquadDialog';
import { useFriendSearch } from '@/hooks/useFriendSearch';
import { convertSquadMembersToPeople } from '@/utils/squadUtils';
import { SquadMember } from '@/types/squad.types';
import { EventSelector } from '@/components/events/EventSelector';
import { useAuth } from '@/contexts/AuthContext';
import { generateUserId } from '@/utils/billCalculations';
import { PersonCard } from '@/components/people/PersonCard';

interface AirbnbGuestsStepProps {
    people: Person[];
    setPeople: (people: Person[]) => void;
    billData: BillData | null;
    isMobile: boolean;
    onAdd: (name?: string, venmoId?: string) => void;
    onRemove: (id: string) => void;
    onUpdate: (id: string, updates: Partial<Person>) => void;
    onAddFromFriend: (friend: any) => void;
    onNext: () => void;
    onPrev: () => void;
    canProceed: boolean;
    currentStep: number;
    totalSteps: number;
    eventId?: string | null;
    onEventChange?: (eventId: string | null) => void;
    onSaveAsFriend?: (person: Person, contactInfo?: string) => void;
    onRemoveFriend?: (friendId: string) => void;
}

export function AirbnbGuestsStep({
    people,
    setPeople,
    billData,
    isMobile,
    onAdd,
    onRemove,
    onUpdate,
    onAddFromFriend,
    onNext,
    onPrev,
    canProceed,
    currentStep,
    totalSteps,
    eventId,
    onEventChange,
    onSaveAsFriend,
    onRemoveFriend
}: AirbnbGuestsStepProps) {
    const { user } = useAuth();
    const [newGuestName, setNewGuestName] = useState('');
    const [isAddPersonOpen, setIsAddPersonOpen] = useState(false);
    const [isFriendsDialogOpen, setIsFriendsDialogOpen] = useState(false);
    const [isSquadDialogOpen, setIsSquadDialogOpen] = useState(false);

    const { friends, filteredFriends, setShowSuggestions, loadFriends } = useFriendSearch(newGuestName);

    const handleSelectFriend = (friend: any) => {
        onAddFromFriend(friend);
        setNewGuestName('');
    };

    const handleManualAdd = (name: string, venmoId: string) => {
        setNewGuestName(name);
        onAdd(name, venmoId);
        setNewGuestName('');
    };

    const handleAddSquad = (members: SquadMember[]) => {
        const newPeople = convertSquadMembersToPeople(members);
        const existingIds = new Set(people.map(p => p.id));
        const uniqueNewPeople = newPeople.filter(p => !existingIds.has(p.id));
        setPeople([...people, ...uniqueNewPeople]);
    };

    const isPersonInFriends = (person: Person): boolean => {
        if (!person) return false;
        return friends.some((friend: any) => {
            if (person.id && friend.id && person.id === friend.id) return true;
            if (friend.name && person.name && friend.name.toLowerCase() === person.name.toLowerCase()) return true;
            return false;
        });
    };

    const handleSaveAsFriend = async (person: Person, contactInfo?: string) => {
        if (onSaveAsFriend) {
            await onSaveAsFriend(person, contactInfo);
            await loadFriends();
        }
    };

    const handleRemoveFriend = async (person: Person) => {
        if (!onRemoveFriend) return;
        const friend = friends.find((f: any) => {
            if (person.id && f.id && person.id === f.id) return true;
            if (f.name && person.name && f.name.toLowerCase() === person.name.toLowerCase()) return true;
            return false;
        });
        if (friend?.id) {
            await onRemoveFriend(friend.id);
            await loadFriends();
        }
    };

    const existingNames = people.map(p => p.name);

    return (
        <div className="flex flex-col gap-6 fade-in max-w-xl mx-auto w-full">
            <div className="text-center mb-2">
                <div className="flex justify-center mb-4">
                    <div className="h-16 w-16 bg-blue-100 rounded-full flex items-center justify-center text-blue-600">
                        <UserPlus className="h-8 w-8" />
                    </div>
                </div>
                <h2 className="text-2xl font-bold">Who's Coming?</h2>
                <p className="text-muted-foreground mt-1">Add all the guests staying at the Airbnb.</p>
            </div>

            <Card className="p-1 sm:p-2 border-none shadow-none bg-transparent">
                {/* Add Guests Section */}
                <div className="rounded-2xl bg-blue-50/60 dark:bg-blue-950/20 border border-blue-200/60 dark:border-blue-800/40 p-4 mb-4">
                    <div className="flex items-center gap-2 mb-3">
                        <div className="h-7 w-7 bg-blue-100 dark:bg-blue-900/50 rounded-full flex items-center justify-center">
                            <UserPlus className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                        </div>
                        <span className="text-sm font-semibold text-blue-700 dark:text-blue-300">Add Guests</span>
                        {onEventChange && (
                            <div className="ml-auto">
                                <EventSelector
                                    selectedEventId={eventId}
                                    onSelect={onEventChange}
                                    className="w-auto min-w-[150px] max-w-[200px] h-9 text-xs bg-background/60 backdrop-blur-sm border-white/20 shadow-sm transition-colors hover:bg-background/80"
                                />
                            </div>
                        )}
                    </div>
                    <div className="flex flex-col sm:flex-row gap-2">
                        <div className="w-full sm:flex-1">
                            <AddPersonDialog
                                isOpen={isAddPersonOpen}
                                setIsOpen={setIsAddPersonOpen}
                                friendSuggestions={filteredFriends}
                                onSearchChange={setNewGuestName}
                                onSelectSuggestion={handleSelectFriend}
                                onAddManual={handleManualAdd}
                                title="Add Guest"
                                description="Search for friends or manually add real life guests to the Airbnb."
                                submitLabel="Add Guest"
                                trigger={
                                    <Button className="w-full h-12 rounded-2xl gap-2 font-medium bg-blue-600 hover:bg-blue-700 shadow-sm transition-all focus:ring-2 focus:ring-blue-500/20 active:scale-[0.98]">
                                        <UserPlus className="w-5 h-5" />
                                        Add Guest
                                    </Button>
                                }
                            />
                        </div>
                        <div className="flex gap-2 w-full sm:flex-1">
                            <Button
                                onClick={() => setIsFriendsDialogOpen(true)}
                                variant="outline"
                                className="flex-1 h-12 rounded-2xl border-blue-200/60 dark:border-blue-700/40 bg-white/50 dark:bg-blue-950/30 backdrop-blur-sm shadow-sm hover:bg-white/80 dark:hover:bg-blue-900/40 transition-all font-medium focus:ring-2 focus:ring-blue-500/20 active:scale-[0.98]"
                            >
                                <UserCheck className="w-5 h-5 mr-2 text-blue-600" />
                                Friends
                            </Button>
                            <Button
                                onClick={() => setIsSquadDialogOpen(true)}
                                variant="outline"
                                className="flex-1 h-12 rounded-2xl border-indigo-200/60 dark:border-indigo-700/40 bg-white/50 dark:bg-indigo-950/30 backdrop-blur-sm shadow-sm hover:bg-white/80 dark:hover:bg-indigo-900/40 transition-all font-medium focus:ring-2 focus:ring-indigo-500/20 active:scale-[0.98]"
                            >
                                <Users className="w-5 h-5 mr-2 text-indigo-600" />
                                Squads
                            </Button>
                        </div>
                    </div>
                </div>

                {/* Guest List Section */}
                <div className="rounded-2xl bg-secondary/20 border border-border/50 p-4">
                    <div className="flex justify-between items-center mb-4">
                        <div className="flex items-center gap-2">
                            <div className="h-7 w-7 bg-secondary rounded-full flex items-center justify-center">
                                <Users className="h-4 w-4 text-foreground/70" />
                            </div>
                            <h3 className="font-semibold text-base">Guest List</h3>
                        </div>
                        <Badge variant="secondary" className="rounded-full px-2.5">{people.length}</Badge>
                    </div>

                    <div className="space-y-3">
                        {people.map(person => {
                            const isCurrentUser = Boolean(user && (person.id === user.uid || person.id === generateUserId(user.uid) || (person as any).userId === user.uid));
                            return (
                                <div key={person.id} className="rounded-2xl border border-border/40 bg-card/60 backdrop-blur-md shadow-sm transition-all hover:shadow-md overflow-hidden">
                                    <PersonCard
                                        person={person}
                                        isCurrentUser={!!isCurrentUser}
                                        isInFriends={isPersonInFriends(person)}
                                        onRemove={onRemove}
                                        onUpdate={async (id, updates) => onUpdate(id, updates)}
                                        onSaveAsFriend={handleSaveAsFriend}
                                        onRemoveFriend={handleRemoveFriend}
                                        existingNames={existingNames}
                                    />
                                </div>
                            );
                        })}

                        {people.length === 0 && (
                            <div className="text-center py-10 px-4 border-2 border-dashed rounded-2xl text-muted-foreground bg-background/40">
                                <User className="w-10 h-10 mx-auto mb-3 opacity-20" />
                                <p>No guests added yet.</p>
                                <p className="text-sm mt-1">Add yourself and your friends above.</p>
                            </div>
                        )}
                    </div>
                </div>
            </Card>

            <AddFromFriendsDialog
                open={isFriendsDialogOpen}
                onOpenChange={setIsFriendsDialogOpen}
                onAddPerson={onAddFromFriend}
            />

            <AddFromSquadDialog
                open={isSquadDialogOpen}
                onOpenChange={setIsSquadDialogOpen}
                onAddSquad={handleAddSquad}
            />

            {!isMobile && (
                <StepFooter
                    currentStep={currentStep}
                    totalSteps={totalSteps}
                    onNext={onNext}
                    onBack={onPrev}
                    nextDisabled={!canProceed}
                />
            )}
        </div>
    );
}
