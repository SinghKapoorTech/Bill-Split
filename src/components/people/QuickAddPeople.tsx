import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, User, Users, Clock, Star, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { Person } from '@/types';
import haptics from '@/utils/haptics';

interface QuickAddPeopleProps {
    onAddPerson: (name: string, venmoId?: string) => void;
    existingPeople: Person[];
    recentPeople?: Person[];
    favoritePeople?: Person[];
    className?: string;
}

/**
 * QuickAddPeople - Smart person adding with suggestions
 * Shows recent contacts, favorites, and allows quick inline adding
 */
export function QuickAddPeople({
    onAddPerson,
    existingPeople,
    recentPeople = [],
    favoritePeople = [],
    className,
}: QuickAddPeopleProps) {
    const [inputValue, setInputValue] = useState('');
    const [isExpanded, setIsExpanded] = useState(false);

    // Filter out already added people from suggestions
    const existingIds = new Set(existingPeople.map(p => p.id));

    const availableRecent = useMemo(
        () => recentPeople.filter(p => !existingIds.has(p.id)).slice(0, 5),
        [recentPeople, existingIds]
    );

    const availableFavorites = useMemo(
        () => favoritePeople.filter(p => !existingIds.has(p.id)).slice(0, 3),
        [favoritePeople, existingIds]
    );

    // Filter suggestions based on input
    const suggestions = useMemo(() => {
        if (!inputValue.trim()) return [];
        const query = inputValue.toLowerCase();
        return [...recentPeople, ...favoritePeople]
            .filter(p => !existingIds.has(p.id) && p.name.toLowerCase().includes(query))
            .slice(0, 4);
    }, [inputValue, recentPeople, favoritePeople, existingIds]);

    const handleQuickAdd = (person: Person) => {
        haptics.buttonTap();
        onAddPerson(person.name, person.venmoId);
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (inputValue.trim()) {
            haptics.buttonTap();
            onAddPerson(inputValue.trim());
            setInputValue('');
        }
    };

    const handleInputFocus = () => {
        setIsExpanded(true);
    };

    return (
        <div className={cn('space-y-4', className)}>
            {/* Quick add input */}
            <form onSubmit={handleSubmit} className="relative">
                <div className="flex gap-2">
                    <div className="relative flex-1">
                        <Input
                            value={inputValue}
                            onChange={(e) => setInputValue(e.target.value)}
                            onFocus={handleInputFocus}
                            placeholder="Add someone..."
                            className="pl-10 h-12 text-base rounded-xl"
                        />
                        <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                    </div>
                    <Button
                        type="submit"
                        disabled={!inputValue.trim()}
                        className="h-12 w-12 rounded-xl p-0"
                    >
                        <Plus className="w-5 h-5" />
                    </Button>
                </div>

                {/* Autocomplete dropdown */}
                <AnimatePresence>
                    {suggestions.length > 0 && (
                        <motion.div
                            initial={{ opacity: 0, y: -10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -10 }}
                            className="absolute top-full left-0 right-12 mt-1 bg-popover border rounded-xl shadow-lg overflow-hidden z-10"
                        >
                            {suggestions.map((person, index) => (
                                <motion.button
                                    key={person.id}
                                    type="button"
                                    initial={{ opacity: 0, x: -10 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    transition={{ delay: index * 0.05 }}
                                    onClick={() => handleQuickAdd(person)}
                                    className="w-full flex items-center gap-3 px-4 py-3 hover:bg-muted transition-colors text-left"
                                >
                                    <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                                        <span className="text-sm font-medium text-primary">
                                            {person.name.charAt(0).toUpperCase()}
                                        </span>
                                    </div>
                                    <div className="flex-1">
                                        <p className="font-medium text-sm">{person.name}</p>
                                        {person.venmoId && (
                                            <p className="text-xs text-muted-foreground">@{person.venmoId}</p>
                                        )}
                                    </div>
                                </motion.button>
                            ))}
                        </motion.div>
                    )}
                </AnimatePresence>
            </form>

            {/* Quick suggestions pills */}
            <AnimatePresence>
                {isExpanded && (availableRecent.length > 0 || availableFavorites.length > 0) && (
                    <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="space-y-3 overflow-hidden"
                    >
                        {/* Favorites */}
                        {availableFavorites.length > 0 && (
                            <div>
                                <div className="flex items-center gap-2 mb-2 text-xs text-muted-foreground">
                                    <Star className="w-3 h-3" />
                                    <span>Favorites</span>
                                </div>
                                <div className="flex flex-wrap gap-2">
                                    {availableFavorites.map((person, index) => (
                                        <motion.button
                                            key={person.id}
                                            initial={{ opacity: 0, scale: 0.8 }}
                                            animate={{ opacity: 1, scale: 1 }}
                                            transition={{ delay: index * 0.05 }}
                                            onClick={() => handleQuickAdd(person)}
                                            className={cn(
                                                'flex items-center gap-2 px-3 py-2 rounded-full',
                                                'bg-warning/10 hover:bg-warning/20 border border-warning/20',
                                                'transition-all duration-200'
                                            )}
                                        >
                                            <span className="text-sm font-medium">{person.name}</span>
                                            <Plus className="w-3.5 h-3.5 text-warning" />
                                        </motion.button>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Recent */}
                        {availableRecent.length > 0 && (
                            <div>
                                <div className="flex items-center gap-2 mb-2 text-xs text-muted-foreground">
                                    <Clock className="w-3 h-3" />
                                    <span>Recent</span>
                                </div>
                                <div className="flex flex-wrap gap-2">
                                    {availableRecent.map((person, index) => (
                                        <motion.button
                                            key={person.id}
                                            initial={{ opacity: 0, scale: 0.8 }}
                                            animate={{ opacity: 1, scale: 1 }}
                                            transition={{ delay: index * 0.05 }}
                                            onClick={() => handleQuickAdd(person)}
                                            className={cn(
                                                'flex items-center gap-2 px-3 py-2 rounded-full',
                                                'bg-muted hover:bg-muted/80 border border-border',
                                                'transition-all duration-200'
                                            )}
                                        >
                                            <span className="text-sm">{person.name}</span>
                                            <Plus className="w-3.5 h-3.5 text-muted-foreground" />
                                        </motion.button>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Close button */}
                        <button
                            type="button"
                            onClick={() => setIsExpanded(false)}
                            className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
                        >
                            <X className="w-3 h-3" />
                            <span>Hide suggestions</span>
                        </button>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Already added people */}
            {existingPeople.length > 0 && (
                <div className="flex flex-wrap gap-2">
                    {existingPeople.map((person, index) => (
                        <motion.div
                            key={person.id}
                            initial={{ opacity: 0, scale: 0.8 }}
                            animate={{ opacity: 1, scale: 1 }}
                            transition={{ delay: index * 0.03 }}
                            className={cn(
                                'flex items-center gap-2 px-3 py-2 rounded-full',
                                'bg-primary/10 border border-primary/20'
                            )}
                        >
                            <div className="w-5 h-5 rounded-full bg-primary flex items-center justify-center">
                                <span className="text-[10px] font-bold text-primary-foreground">
                                    {person.name.charAt(0).toUpperCase()}
                                </span>
                            </div>
                            <span className="text-sm font-medium">{person.name}</span>
                        </motion.div>
                    ))}
                </div>
            )}
        </div>
    );
}
