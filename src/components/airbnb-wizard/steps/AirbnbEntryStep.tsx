import { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Home, Calendar, Plus, Trash2 } from 'lucide-react';
import { StepFooter } from '@/components/shared/StepFooter';
import { BillData, BillItem } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { DateRange, DayPicker } from 'react-day-picker';
import { format, differenceInDays } from 'date-fns';
import { cn } from '@/lib/utils';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

import "react-day-picker/dist/style.css";

interface Fee {
    id: string;
    name: string;
    amount: number;
}

interface AirbnbEntryStepProps {
    billData: BillData | null;
    setBillData: (data: BillData | null) => void;
    onNext: () => void;
    canProceed: boolean;
    currentStep: number;
    totalSteps: number;
    isMobile: boolean;
    onTriggerSave?: (options?: { overrideData?: Partial<import('@/types/bill.types').Bill>; forceSave?: boolean }) => void;
    airbnbData?: import('@/types/bill.types').Bill['airbnbData'];
    setAirbnbData: (data: import('@/types/bill.types').Bill['airbnbData']) => void;
}

export function AirbnbEntryStep({
    billData,
    setBillData,
    onNext,
    canProceed,
    currentStep,
    totalSteps,
    isMobile,
    onTriggerSave,
    airbnbData,
    setAirbnbData
}: AirbnbEntryStepProps) {
    // State
    const [dateRange, setDateRange] = useState<DateRange | undefined>(() => {
        if (airbnbData?.startDate && airbnbData?.endDate) {
            return {
                from: new Date(airbnbData.startDate),
                to: new Date(airbnbData.endDate)
            };
        }
        return undefined;
    });

    const [totalStayCost, setTotalStayCost] = useState<string>(airbnbData?.totalStayCost?.toString() || '');
    const [fees, setFees] = useState<Fee[]>(airbnbData?.fees || []);

    // Default fees removed per user request

    // Effect to calculate items when inputs change
    useEffect(() => {
        if (!dateRange?.from || !dateRange?.to) {
            // Keep existing if we have some, but generally don't wipe out immediately
            return;
        }

        const nights = differenceInDays(dateRange.to, dateRange.from);
        if (nights <= 0) return;

        const stayCostNum = parseFloat(totalStayCost) || 0;
        const costPerNight = nights > 0 ? (stayCostNum / nights) : 0;

        const newItems: BillItem[] = [];

        // Generate night items
        for (let i = 0; i < nights; i++) {
            const currentNight = new Date(dateRange.from);
            currentNight.setDate(currentNight.getDate() + i);
            newItems.push({
                id: `night-${format(currentNight, 'yyyy-MM-dd')}`,
                name: `Night of ${format(currentNight, 'MMM d')}`,
                price: costPerNight
            });
        }

        // Add fees
        let totalFees = 0;
        fees.forEach(fee => {
            if (fee.amount > 0 && fee.name.trim() !== '') {
                newItems.push({
                    id: fee.id,
                    name: fee.name,
                    price: fee.amount
                });
                totalFees += fee.amount;
            }
        });

        const newTotal = stayCostNum + totalFees;

        const newBillData: BillData = {
            items: newItems,
            subtotal: newTotal,
            tax: 0,
            tip: 0,
            total: newTotal,
            restaurantName: `${nights} Night Stay`
        };

        setBillData(newBillData);

        // Update airbnbData for persistence
        setAirbnbData({
            startDate: dateRange.from.toISOString(),
            endDate: dateRange.to.toISOString(),
            nights: nights,
            totalStayCost: stayCostNum,
            fees: fees
        });

    }, [dateRange, totalStayCost, fees]);

    const handleAddFee = () => {
        setFees([...fees, { id: `fee-${Date.now()}`, name: '', amount: 0 }]);
    };

    const handleUpdateFee = (id: string, field: keyof Fee, value: string | number) => {
        setFees(fees.map(f => f.id === id ? { ...f, [field]: value } : f));
    };

    const handleRemoveFee = (id: string) => {
        setFees(fees.filter(f => f.id !== id));
    };

    const handleSaveCost = () => {
        onTriggerSave?.({ forceSave: true });
    };

    const isReady = !!dateRange?.from && !!dateRange?.to && parseFloat(totalStayCost) > 0;

    return (
        <div className="flex flex-col gap-6 fade-in max-w-2xl mx-auto w-full">
            <Card className="p-5 flex flex-col gap-6">

                {/* Dates */}
                <div className="flex flex-col gap-3">
                    <Label className="text-base font-semibold">Select Dates</Label>
                    <div className="grid gap-2">
                        <Popover>
                            <PopoverTrigger asChild>
                                <Button
                                    id="date"
                                    variant={"outline"}
                                    className={cn(
                                        "w-full justify-start text-left font-normal h-12",
                                        !dateRange && "text-muted-foreground"
                                    )}
                                >
                                    <Calendar className="mr-2 h-4 w-4" />
                                    {dateRange?.from ? (
                                        dateRange.to ? (
                                            <>
                                                {format(dateRange.from, "LLL dd, y")} -{" "}
                                                {format(dateRange.to, "LLL dd, y")}
                                                <span className="ml-2 px-2 py-0.5 bg-rose-100 text-rose-700 rounded-md text-xs font-medium">
                                                    {differenceInDays(dateRange.to, dateRange.from)} Nights
                                                </span>
                                            </>
                                        ) : (
                                            format(dateRange.from, "LLL dd, y")
                                        )
                                    ) : (
                                        <span>Pick check-in and check-out dates</span>
                                    )}
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0" align="center">
                                <DayPicker
                                    mode="range"
                                    defaultMonth={dateRange?.from}
                                    selected={dateRange}
                                    onSelect={setDateRange}
                                    numberOfMonths={isMobile ? 1 : 2}
                                />
                            </PopoverContent>
                        </Popover>
                    </div>
                </div>

                {/* Total Cost */}
                <div className="flex flex-col gap-3">
                    <Label className="text-base font-semibold" htmlFor="totalCost">Total Stay Cost</Label>
                    <p className="text-sm text-muted-foreground -mt-2">Price for the accommodation only, before additional fees.</p>
                    <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                        <Input
                            id="totalCost"
                            type="number"
                            placeholder="0.00"
                            className="pl-8 text-lg h-12"
                            value={totalStayCost}
                            onChange={(e) => setTotalStayCost(e.target.value)}
                            onBlur={handleSaveCost}
                        />
                    </div>
                </div>

                {/* Additional Fees */}
                <div className="flex flex-col gap-4 mt-2 pt-6 border-t">
                    <div className="flex items-center justify-between">
                        <Label className="text-base font-semibold">Additional Fees</Label>
                        <Button variant="ghost" size="sm" onClick={handleAddFee} className="text-primary hover:text-primary hover:bg-primary/10">
                            <Plus className="w-4 h-4 mr-1" /> Add Fee
                        </Button>
                    </div>

                    <div className="flex flex-col gap-3">
                        {fees.map((fee, index) => (
                            <div key={fee.id} className="flex items-center gap-3">
                                <Input
                                    placeholder="Fee Name (e.g. Cleaning)"
                                    className="flex-1"
                                    value={fee.name}
                                    onChange={(e) => handleUpdateFee(fee.id, 'name', e.target.value)}
                                    onBlur={handleSaveCost}
                                />
                                <div className="relative w-32">
                                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                                    <Input
                                        type="number"
                                        className="pl-7"
                                        placeholder="0.00"
                                        value={fee.amount || ''}
                                        onChange={(e) => handleUpdateFee(fee.id, 'amount', parseFloat(e.target.value) || 0)}
                                        onBlur={handleSaveCost}
                                    />
                                </div>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="text-muted-foreground hover:text-destructive shrink-0"
                                    onClick={() => handleRemoveFee(fee.id)}
                                >
                                    <Trash2 className="w-4 h-4" />
                                </Button>
                            </div>
                        ))}
                        {fees.length === 0 && (
                            <p className="text-sm text-muted-foreground italic">No additional fees added.</p>
                        )}
                    </div>
                </div>

            </Card>

            <div className="hidden md:block">
                <StepFooter
                    currentStep={currentStep}
                    totalSteps={totalSteps}
                    onNext={onNext}
                    nextDisabled={!isReady}
                />
            </div>
        </div>
    );
}
