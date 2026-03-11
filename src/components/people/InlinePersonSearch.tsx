import { useState, useRef, useEffect, useMemo } from 'react';
import { Search, UserPlus, Users, User, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Input } from '@/components/ui/input';
import { FriendSuggestion } from '@/hooks/useFriendSearch';
import { HydratedSquad, SquadMember } from '@/types/squad.types';

interface InlinePersonSearchProps {
  friends: FriendSuggestion[];
  filteredFriends: FriendSuggestion[];
  squads: HydratedSquad[];
  existingPeopleIds: Set<string>;
  onAddFromFriend: (friend: FriendSuggestion) => void;
  onAddSquad: (members: SquadMember[]) => void;
  onAddGuest: (name: string) => void;
  isSearching: boolean;
  onSearchChange: (query: string) => void;
}

export function InlinePersonSearch({
  friends,
  filteredFriends,
  squads,
  existingPeopleIds,
  onAddFromFriend,
  onAddSquad,
  onAddGuest,
  isSearching,
  onSearchChange,
}: InlinePersonSearchProps) {
  const [inputValue, setInputValue] = useState('');
  const [isFocused, setIsFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsFocused(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const query = inputValue.trim().toLowerCase();

  // Available friends (not already on bill)
  const availableFriends = useMemo(() => {
    const source = query.length >= 2 ? filteredFriends : friends;
    return source.filter(f => f.id && !existingPeopleIds.has(f.id));
  }, [query, friends, filteredFriends, existingPeopleIds]);

  // Available squads filtered by search
  const availableSquads = useMemo(() => {
    if (!query) return squads;
    return squads.filter(s => s.name.toLowerCase().includes(query));
  }, [squads, query]);

  const showDropdown = isFocused && (availableFriends.length > 0 || availableSquads.length > 0 || query.length >= 1);

  const handleSelect = (friend: FriendSuggestion) => {
    onAddFromFriend(friend);
    setInputValue('');
    onSearchChange('');
    inputRef.current?.blur();
    setIsFocused(false);
  };

  const handleSelectSquad = (squad: HydratedSquad) => {
    onAddSquad(squad.members);
    setInputValue('');
    onSearchChange('');
    inputRef.current?.blur();
    setIsFocused(false);
  };

  const handleAddGuest = () => {
    if (!inputValue.trim()) return;
    onAddGuest(inputValue.trim());
    setInputValue('');
    onSearchChange('');
    inputRef.current?.blur();
    setIsFocused(false);
  };

  const handleInputChange = (val: string) => {
    setInputValue(val);
    onSearchChange(val);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && inputValue.trim()) {
      // If there are friend suggestions, select the first one
      if (availableFriends.length > 0 && query.length >= 2) {
        handleSelect(availableFriends[0]);
      } else {
        handleAddGuest();
      }
    }
    if (e.key === 'Escape') {
      setIsFocused(false);
      inputRef.current?.blur();
    }
  };

  // Count new members a squad would add
  const getSquadNewCount = (squad: HydratedSquad) => {
    const newMembers = squad.members.filter(m => !m.id || !existingPeopleIds.has(m.id));
    return newMembers.length;
  };

  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          ref={inputRef}
          value={inputValue}
          onChange={(e) => handleInputChange(e.target.value)}
          onFocus={() => setIsFocused(true)}
          onKeyDown={handleKeyDown}
          placeholder="Add a friend or guest..."
          className="pl-9 pr-10 h-11 text-base rounded-xl bg-secondary/30 border-border/50 focus:bg-background"
        />
        {isSearching && (
          <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground animate-spin" />
        )}
      </div>

      <AnimatePresence>
        {showDropdown && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.15 }}
            className="absolute top-full left-0 right-0 mt-1.5 bg-popover border border-border rounded-xl shadow-lg overflow-hidden z-20 max-h-[280px] overflow-y-auto"
          >
            {/* Friends section */}
            {availableFriends.length > 0 && (
              <div>
                <div className="px-3 py-1.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider bg-muted/30">
                  Friends
                </div>
                {availableFriends.slice(0, 6).map((friend, idx) => (
                  <button
                    key={friend.id || idx}
                    type="button"
                    onClick={() => handleSelect(friend)}
                    className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-accent/50 active:bg-accent transition-colors text-left"
                  >
                    <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                      <span className="text-xs font-medium text-primary">
                        {friend.name.charAt(0).toUpperCase()}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className="text-sm font-medium truncate block">{friend.name}</span>
                      {friend.username && (
                        <span className="text-[11px] text-muted-foreground">@{friend.username}</span>
                      )}
                    </div>
                    <UserPlus className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                  </button>
                ))}
              </div>
            )}

            {/* Squads section */}
            {availableSquads.length > 0 && (
              <div>
                {availableFriends.length > 0 && <div className="h-px bg-border" />}
                <div className="px-3 py-1.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider bg-muted/30">
                  Squads
                </div>
                {availableSquads.map((squad) => {
                  const newCount = getSquadNewCount(squad);
                  return (
                    <button
                      key={squad.id}
                      type="button"
                      onClick={() => handleSelectSquad(squad)}
                      className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-accent/50 active:bg-accent transition-colors text-left"
                    >
                      <div className="w-7 h-7 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
                        <Users className="w-3.5 h-3.5 text-muted-foreground" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <span className="text-sm font-medium truncate block">{squad.name}</span>
                        <span className="text-[11px] text-muted-foreground">
                          {newCount === squad.members.length
                            ? `${squad.members.length} members`
                            : `${newCount} of ${squad.members.length} new`}
                        </span>
                      </div>
                      <UserPlus className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                    </button>
                  );
                })}
              </div>
            )}

            {/* Add as guest */}
            {query.length >= 1 && (
              <div>
                {(availableFriends.length > 0 || availableSquads.length > 0) && (
                  <div className="h-px bg-border" />
                )}
                <button
                  type="button"
                  onClick={handleAddGuest}
                  className="w-full flex items-center gap-2.5 px-3 py-2.5 hover:bg-accent/50 active:bg-accent transition-colors text-left"
                >
                  <div className="w-7 h-7 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
                    <User className="w-3.5 h-3.5 text-muted-foreground" />
                  </div>
                  <span className="text-sm text-muted-foreground">
                    Add <span className="font-medium text-foreground">"{inputValue.trim()}"</span> as guest
                  </span>
                </button>
              </div>
            )}

            {/* Empty state when searching */}
            {query.length >= 2 && availableFriends.length === 0 && availableSquads.length === 0 && !isSearching && (
              <div className="px-3 py-3 text-center">
                <p className="text-xs text-muted-foreground">No friends or squads found</p>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
