import { useState, useMemo } from 'react';
import { Check, ChevronsUpDown, Calendar } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
} from '@/components/ui/command';
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from '@/components/ui/popover';
import { useEventManager } from '@/hooks/useEventManager';

interface EventSelectorProps {
    selectedEventId?: string | null;
    onSelect: (eventId: string | null) => void;
    className?: string;
}

export function EventSelector({ selectedEventId, onSelect, className }: EventSelectorProps) {
    const [open, setOpen] = useState(false);
    const { events, loading } = useEventManager();

    const selectedEvent = useMemo(
        () => events.find((v) => v.id === selectedEventId),
        [events, selectedEventId]
    );

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button
                    variant="ghost"
                    role="combobox"
                    aria-expanded={open}
                    className={cn('w-auto h-8 px-2 text-xs font-normal text-black hover:text-foreground justify-between', className)}
                >
                    <div className="flex items-center gap-1.5 truncate">
                        <Calendar className="h-4 w-4 shrink-0 opacity-50" />
                        <span className="truncate ">
                            {loading
                                ? 'Loading events...'
                                : selectedEvent
                                    ? selectedEvent.name
                                    : 'Event...'}
                        </span>
                    </div>
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[200px] p-0" align="center">
                <Command>
                    <CommandInput placeholder="Search event..." />
                    <CommandEmpty>No event found.</CommandEmpty>
                    <CommandList>
                        <CommandGroup>
                            <CommandItem
                                value="none"
                                className="text-foreground italic"
                                onSelect={() => {
                                    onSelect(null);
                                    setOpen(false);
                                }}
                            >
                                <Check
                                    className={cn(
                                        'mr-2 h-4 w-4',
                                        !selectedEventId ? 'opacity-100' : 'opacity-0'
                                    )}
                                />
                                None (Private Bill)
                            </CommandItem>
                            {events.map((event) => (
                                <CommandItem
                                    key={event.id}
                                    value={event.name}
                                    onSelect={() => {
                                        onSelect(event.id);
                                        setOpen(false);
                                    }}
                                >
                                    <Check
                                        className={cn(
                                            'mr-2 h-4 w-4',
                                            selectedEventId === event.id ? 'opacity-100' : 'opacity-0'
                                        )}
                                    />
                                    {event.name}
                                </CommandItem>
                            ))}
                        </CommandGroup>
                    </CommandList>
                </Command>
            </PopoverContent>
        </Popover>
    );
}
