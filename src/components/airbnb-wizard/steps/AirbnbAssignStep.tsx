import { useState, useMemo } from 'react';
import { Card } from '@/components/ui/card';
import { BillData, Person, ItemAssignment } from '@/types';
import { StepFooter } from '@/components/shared/StepFooter';
import { Check, CalendarDays, Moon, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';

interface AirbnbAssignStepProps {
    billData: BillData | null;
    people: Person[];
    itemAssignments: ItemAssignment;
    onAssign: (itemId: string, personId: string, checked: boolean) => void;
    onNext: () => void;
    onPrev: () => void;
    canProceed: boolean;
    currentStep: number;
    totalSteps: number;
    isMobile: boolean;
}

export function AirbnbAssignStep({
    billData,
    people,
    itemAssignments,
    onAssign,
    onNext,
    onPrev,
    canProceed,
    currentStep,
    totalSteps,
    isMobile
}: AirbnbAssignStepProps) {
    const [expandedItemId, setExpandedItemId] = useState<string | null>(null);

    // Identify nights vs fees
    const categorizedItems = useMemo(() => {
        if (!billData?.items) return { nights: [], fees: [] };

        return {
            nights: billData.items.filter(item => item.id.startsWith('night-')),
            fees: billData.items.filter(item => !item.id.startsWith('night-'))
        };
    }, [billData?.items]);

    const handleToggleItem = (itemId: string) => {
        setExpandedItemId(prev => prev === itemId ? null : itemId);
    };

    const isItemFullyAssigned = (itemId: string) => {
        return itemAssignments[itemId] && itemAssignments[itemId].length > 0;
    };

    const isAllNightsAssigned = categorizedItems.nights.every(n => isItemFullyAssigned(n.id)) &&
        categorizedItems.fees.every(f => isItemFullyAssigned(f.id));

    if (!billData || people.length === 0) {
        return <div className="text-center text-muted-foreground p-8">Missing trip data or guests. Please go back.</div>;
    }

    return (
        <div className="flex flex-col gap-6 fade-in max-w-xl mx-auto w-full">
            {!isAllNightsAssigned && (
                <div className="flex items-start gap-3 p-4 bg-amber-50 rounded-2xl text-amber-800 text-sm border border-amber-200">
                    <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
                    <p>Make sure every night and fee is assigned to at least one guest before proceeding.</p>
                </div>
            )}

            <div className="flex flex-col gap-8 pb-10">
                {/* Nights Section */}
                {categorizedItems.nights.length > 0 && (
                    <div className="flex flex-col gap-3">
                        <h3 className="font-semibold text-lg flex items-center gap-2">
                            <Moon className="w-5 h-5 text-indigo-500" />
                            Nightly Stays
                        </h3>
                        {categorizedItems.nights.map(night => (
                            <Card key={night.id} className={cn(
                                "border transition-all duration-200 overflow-hidden shadow-sm",
                                isItemFullyAssigned(night.id) ? "border-green-200 bg-green-50/10" : "border-rose-200 bg-rose-50/10",
                                expandedItemId === night.id ? "ring-2 ring-primary/20" : ""
                            )}>
                                <div
                                    className="p-4 flex items-center justify-between cursor-pointer active:bg-black/5"
                                    onClick={() => handleToggleItem(night.id)}
                                >
                                    <div className="flex flex-col">
                                        <span className="font-medium">{night.name}</span>
                                        <span className="text-sm text-muted-foreground">${night.price.toFixed(2)} / night</span>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <div className="flex -space-x-2">
                                            {(itemAssignments[night.id] || []).slice(0, 3).map(pId => {
                                                const person = people.find(p => p.id === pId);
                                                return person ? (
                                                    <div key={pId} className="w-8 h-8 rounded-full bg-white border border-border flex items-center justify-center text-xs font-bold text-foreground z-10">
                                                        {person.name.charAt(0).toUpperCase()}
                                                    </div>
                                                ) : null;
                                            })}
                                            {(itemAssignments[night.id] || []).length > 3 && (
                                                <div className="w-8 h-8 rounded-full bg-muted border border-border flex items-center justify-center text-xs font-bold z-10">
                                                    +{(itemAssignments[night.id] || []).length - 3}
                                                </div>
                                            )}
                                        </div>
                                        {isItemFullyAssigned(night.id) ? (
                                            <div className="w-6 h-6 rounded-full bg-green-100 text-green-600 flex items-center justify-center shrink-0">
                                                <Check className="w-4 h-4" />
                                            </div>
                                        ) : (
                                            <div className="w-6 h-6 rounded-full border-2 border-dashed border-rose-300 shrink-0" />
                                        )}
                                    </div>
                                </div>

                                {expandedItemId === night.id && (
                                    <div className="border-t bg-card p-4 grid grid-cols-2 gap-3 sm:grid-cols-3 animate-in slide-in-from-top-2">
                                        {people.map(person => {
                                            const isAssigned = (itemAssignments[night.id] || []).includes(person.id);
                                            return (
                                                <label
                                                    key={person.id}
                                                    className={cn(
                                                        "flex items-center p-3 rounded-xl border cursor-pointer transition-all",
                                                        isAssigned ? "bg-primary/5 border-primary" : "hover:bg-muted bg-background"
                                                    )}
                                                >
                                                    <Checkbox
                                                        checked={isAssigned}
                                                        onCheckedChange={(checked) => onAssign(night.id, person.id, !!checked)}
                                                        className="mr-3"
                                                    />
                                                    <span className="font-medium truncate">{person.name}</span>
                                                </label>
                                            )
                                        })}
                                        <div className="col-span-full mt-2">
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                className="w-full text-xs"
                                                onClick={() => {
                                                    const isAll = (itemAssignments[night.id] || []).length === people.length;
                                                    people.forEach(p => onAssign(night.id, p.id, !isAll));
                                                }}
                                            >
                                                {(itemAssignments[night.id] || []).length === people.length ? "Deselect All" : "Select All Guests"}
                                            </Button>
                                        </div>
                                    </div>
                                )}
                            </Card>
                        ))}
                    </div>
                )}

                {/* Fees Section */}
                {categorizedItems.fees.length > 0 && (
                    <div className="flex flex-col gap-3">
                        <h3 className="font-semibold text-lg flex items-center gap-2 mt-4 text-muted-foreground">
                            Additional Fees
                        </h3>
                        {categorizedItems.fees.map(fee => (
                            <Card key={fee.id} className={cn(
                                "border transition-all duration-200 overflow-hidden shadow-sm",
                                isItemFullyAssigned(fee.id) ? "border-green-200 bg-green-50/10" : "border-rose-200 bg-rose-50/10",
                                expandedItemId === fee.id ? "ring-2 ring-primary/20" : ""
                            )}>
                                <div
                                    className="p-4 flex items-center justify-between cursor-pointer active:bg-black/5"
                                    onClick={() => handleToggleItem(fee.id)}
                                >
                                    <div className="flex flex-col">
                                        <span className="font-medium">{fee.name}</span>
                                        <span className="text-sm text-muted-foreground">${fee.price.toFixed(2)}</span>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <div className="flex -space-x-2">
                                            {(itemAssignments[fee.id] || []).slice(0, 3).map(pId => {
                                                const person = people.find(p => p.id === pId);
                                                return person ? (
                                                    <div key={pId} className="w-8 h-8 rounded-full bg-white border border-border flex items-center justify-center text-xs font-bold text-foreground z-10">
                                                        {person.name.charAt(0).toUpperCase()}
                                                    </div>
                                                ) : null;
                                            })}
                                        </div>
                                        {isItemFullyAssigned(fee.id) ? (
                                            <div className="w-6 h-6 rounded-full bg-green-100 text-green-600 flex items-center justify-center shrink-0">
                                                <Check className="w-4 h-4" />
                                            </div>
                                        ) : (
                                            <div className="w-6 h-6 rounded-full border-2 border-dashed border-rose-300 shrink-0" />
                                        )}
                                    </div>
                                </div>

                                {expandedItemId === fee.id && (
                                    <div className="border-t bg-card p-4 grid grid-cols-2 gap-3 sm:grid-cols-3 animate-in slide-in-from-top-2">
                                        {people.map(person => {
                                            const isAssigned = (itemAssignments[fee.id] || []).includes(person.id);
                                            return (
                                                <label
                                                    key={person.id}
                                                    className={cn(
                                                        "flex items-center p-3 rounded-xl border cursor-pointer transition-all",
                                                        isAssigned ? "bg-primary/5 border-primary" : "hover:bg-muted bg-background"
                                                    )}
                                                >
                                                    <Checkbox
                                                        checked={isAssigned}
                                                        onCheckedChange={(checked) => onAssign(fee.id, person.id, !!checked)}
                                                        className="mr-3"
                                                    />
                                                    <span className="font-medium truncate">{person.name}</span>
                                                </label>
                                            )
                                        })}
                                        <div className="col-span-full mt-2">
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                className="w-full text-xs"
                                                onClick={() => {
                                                    const isAll = (itemAssignments[fee.id] || []).length === people.length;
                                                    people.forEach(p => onAssign(fee.id, p.id, !isAll));
                                                }}
                                            >
                                                {(itemAssignments[fee.id] || []).length === people.length ? "Deselect All" : "Select All Guests"}
                                            </Button>
                                        </div>
                                    </div>
                                )}
                            </Card>
                        ))}
                    </div>
                )}
            </div>

            {!isMobile && (
                <div className="mt-4">
                    <StepFooter
                        currentStep={currentStep}
                        totalSteps={totalSteps}
                        onNext={onNext}
                        onBack={onPrev}
                        nextDisabled={!isAllNightsAssigned}
                    />
                </div>
            )}
        </div>
    );
}
