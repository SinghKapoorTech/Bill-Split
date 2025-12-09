import { useRef, useEffect, useState } from 'react';
import { UserPlus, UserCheck, Users, ChevronDown, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

interface Friend {
    name: string;
    venmoId?: string;
}

interface AddPersonFormProps {
    // Input state
    name: string;
    venmoId: string;
    useNameAsVenmoId: boolean;
    showVenmoField: boolean;

    // Change handlers
    onNameChange: (value: string) => void;
    onVenmoIdChange: (value: string) => void;
    onUseNameAsVenmoIdChange: (checked: boolean) => void;
    onShowVenmoFieldChange: (show: boolean) => void;
    onSubmit: () => void;

    // Autocomplete
    friendSuggestions: Friend[];
    showSuggestions: boolean;
    onSelectSuggestion: (friend: Friend) => void;
    onCloseSuggestions: () => void;

    // Dialog handlers
    onOpenFriendsDialog: () => void;
    onOpenSquadDialog: () => void;
}

/**
 * AddPersonForm Component
 * Form for adding new people to the bill
 * Extracted from PeopleManager lines 158-306
 */
export function AddPersonForm({
    name,
    venmoId,
    useNameAsVenmoId,
    showVenmoField,
    onNameChange,
    onVenmoIdChange,
    onUseNameAsVenmoIdChange,
    onShowVenmoFieldChange,
    onSubmit,
    friendSuggestions,
    showSuggestions,
    onSelectSuggestion,
    onCloseSuggestions,
    onOpenFriendsDialog,
    onOpenSquadDialog
}: AddPersonFormProps) {
    const inputRef = useRef<HTMLInputElement>(null);
    const suggestionsRef = useRef<HTMLDivElement>(null);
    const [venmoPopoverOpen, setVenmoPopoverOpen] = useState(false);

    // Close suggestions when clicking outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (
                suggestionsRef.current &&
                !suggestionsRef.current.contains(event.target as Node) &&
                inputRef.current &&
                !inputRef.current.contains(event.target as Node)
            ) {
                onCloseSuggestions();
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [onCloseSuggestions]);

    const handleSubmit = () => {
        onSubmit();
        onShowVenmoFieldChange(false);
    };

    return (
        <div className="space-y-3 mb-4">
            {/* Row 1: Name Input + Venmo Options + Add Button */}
            <div className="flex gap-2">
                <div className="flex-1 relative">
                    <Input
                        ref={inputRef}
                        placeholder="Person's name"
                        value={name}
                        onChange={(e) => onNameChange(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && !showVenmoField && handleSubmit()}
                        className="w-full"
                    />
                    {showSuggestions && friendSuggestions.length > 0 && (
                        <div
                            ref={suggestionsRef}
                            className="absolute z-50 w-full mt-1 bg-popover border border-border rounded-md shadow-lg max-h-[200px] overflow-y-auto"
                        >
                            {friendSuggestions.map((friend, index) => (
                                <div
                                    key={index}
                                    onClick={() => onSelectSuggestion(friend)}
                                    className="px-3 py-2 cursor-pointer hover:bg-accent hover:text-accent-foreground transition-colors"
                                >
                                    <div className="font-medium">{friend.name}</div>
                                    {friend.venmoId && (
                                        <div className="text-xs text-muted-foreground">
                                            @{friend.venmoId}
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                <Popover open={venmoPopoverOpen} onOpenChange={setVenmoPopoverOpen}>
                    <PopoverTrigger asChild>
                        <Button
                            variant="outline"
                            size="sm"
                            className={`hover:bg-secondary shrink-0 text-xs whitespace-nowrap ${useNameAsVenmoId || showVenmoField ? 'bg-primary/10' : ''
                                }`}
                        >
                            {useNameAsVenmoId
                                ? 'Use name'
                                : showVenmoField
                                    ? 'Add Ve...'
                                    : 'Venmo ID'}
                            <ChevronDown className="ml-1 h-3 w-3" />
                        </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-64 p-0" align="start">
                        <div className="p-2 space-y-1">
                            <div
                                className={`flex items-center space-x-3 px-3 py-2.5 rounded-md cursor-pointer transition-all ${showVenmoField && !useNameAsVenmoId
                                    ? 'bg-primary/10 hover:bg-primary/20'
                                    : 'hover:bg-secondary'
                                    }`}
                                onClick={() => {
                                    if (showVenmoField && !useNameAsVenmoId) {
                                        onShowVenmoFieldChange(false);
                                    } else {
                                        onUseNameAsVenmoIdChange(false);
                                        onShowVenmoFieldChange(true);
                                    }
                                    setVenmoPopoverOpen(false);
                                }}
                            >
                                <div
                                    className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-all ${showVenmoField && !useNameAsVenmoId
                                        ? 'bg-primary border-primary'
                                        : 'border-input'
                                        }`}
                                >
                                    {showVenmoField && !useNameAsVenmoId && <Check className="w-3 h-3 text-primary-foreground" />}
                                </div>
                                <span className="text-sm font-medium flex-1">
                                    Add Venmo ID
                                </span>
                            </div>
                            <div
                                className={`flex items-center space-x-3 px-3 py-2.5 rounded-md cursor-pointer transition-all ${useNameAsVenmoId
                                    ? 'bg-primary/10 hover:bg-primary/20'
                                    : 'hover:bg-secondary'
                                    }`}
                                onClick={() => {
                                    if (useNameAsVenmoId) {
                                        onUseNameAsVenmoIdChange(false);
                                    } else {
                                        onUseNameAsVenmoIdChange(true);
                                        onShowVenmoFieldChange(false);
                                    }
                                    setVenmoPopoverOpen(false);
                                }}
                            >
                                <div
                                    className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-all ${useNameAsVenmoId
                                        ? 'bg-primary border-primary'
                                        : 'border-input'
                                        }`}
                                >
                                    {useNameAsVenmoId && <Check className="w-3 h-3 text-primary-foreground" />}
                                </div>
                                <span className="text-sm font-medium flex-1">
                                    Use name as Venmo ID
                                </span>
                            </div>
                        </div>
                    </PopoverContent>
                </Popover>

                <Button onClick={handleSubmit} variant="success" className="shrink-0">
                    <UserPlus className="w-4 h-4 mr-1" />
                    Add
                </Button>
            </div>

            {/* Row 2: Venmo ID Input (conditional) */}
            {showVenmoField && !useNameAsVenmoId && (
                <Input
                    id="venmoId"
                    placeholder="Enter Venmo username (without @)"
                    value={venmoId}
                    onChange={(e) => onVenmoIdChange(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
                    className='text-base placeholder:text-xs'
                />
            )}

            {/* Row 3: Friends + Squad Buttons */}
            <div className="flex gap-2">
                <Button
                    onClick={onOpenFriendsDialog}
                    variant="outline"
                    className="flex-1"
                >
                    <UserCheck className="w-4 h-4 mr-2" />
                    Friends
                </Button>
                <Button
                    onClick={onOpenSquadDialog}
                    variant="outline"
                    className="flex-1"
                >
                    <Users className="w-4 h-4 mr-2" />
                    Squad
                </Button>
            </div>
        </div>
    );
}
