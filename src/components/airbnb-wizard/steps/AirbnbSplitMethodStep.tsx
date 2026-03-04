import { Card } from '@/components/ui/card';
import { Users, CalendarDays, ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { StepFooter } from '@/components/shared/StepFooter';

interface AirbnbSplitMethodStepProps {
    splitEvenly: boolean;
    onToggleSplitEvenly: (value: boolean) => void;
    onNext: () => void;
    onPrev: () => void;
    currentStep: number;
    totalSteps: number;
    isMobile: boolean;
}

export function AirbnbSplitMethodStep({
    splitEvenly,
    onToggleSplitEvenly,
    onNext,
    onPrev,
    currentStep,
    totalSteps,
    isMobile
}: AirbnbSplitMethodStepProps) {

    const handleSelect = (evenly: boolean) => {
        onToggleSplitEvenly(evenly);
        // Add a tiny delay to show the selection state before auto-advancing
        setTimeout(() => {
            onNext();
        }, 300);
    };

    return (
        <div className="flex flex-col gap-6 fade-in max-w-xl mx-auto w-full">
            <div className="text-center mb-4">
                <h2 className="text-2xl font-bold">How do you want to split?</h2>
                <p className="text-muted-foreground mt-2">Choose how you want to divide the cost of the stay.</p>
            </div>

            <div className="grid grid-cols-1 gap-4">
                <button
                    onClick={() => handleSelect(true)}
                    className={cn(
                        "group relative flex flex-col items-center gap-4 p-8 rounded-3xl border-2 transition-all duration-300 text-left overflow-hidden shadow-sm hover:shadow-md active:scale-[0.98]",
                        splitEvenly 
                            ? "bg-blue-50/50 border-blue-500 shadow-blue-100" 
                            : "bg-card border-border/40 hover:border-blue-300 hover:bg-blue-50/30"
                    )}
                >
                    <div className={cn(
                        "h-16 w-16 rounded-2xl flex items-center justify-center transition-transform duration-300 group-hover:scale-110",
                        splitEvenly ? "bg-blue-600 text-white" : "bg-blue-100 text-blue-600"
                    )}>
                        <Users className="w-8 h-8" />
                    </div>
                    <div className="text-center">
                        <h3 className="text-xl font-bold text-foreground">Split Evenly</h3>
                        <p className="text-muted-foreground mt-2 text-sm max-w-[250px]">
                            Everyone pays the exact same amount for the entire stay. Quick and easy.
                        </p>
                    </div>
                    {splitEvenly && (
                        <div className="absolute top-4 right-4 h-6 w-6 rounded-full bg-blue-600 flex items-center justify-center text-white">
                            <ArrowRight className="w-4 h-4" />
                        </div>
                    )}
                </button>

                <button
                    onClick={() => handleSelect(false)}
                    className={cn(
                        "group relative flex flex-col items-center gap-4 p-8 rounded-3xl border-2 transition-all duration-300 text-left overflow-hidden shadow-sm hover:shadow-md active:scale-[0.98]",
                        !splitEvenly 
                            ? "bg-rose-50/50 border-rose-500 shadow-rose-100" 
                            : "bg-card border-border/40 hover:border-rose-300 hover:bg-rose-50/30"
                    )}
                >
                    <div className={cn(
                        "h-16 w-16 rounded-2xl flex items-center justify-center transition-transform duration-300 group-hover:scale-110",
                        !splitEvenly ? "bg-rose-600 text-white" : "bg-rose-100 text-rose-600"
                    )}>
                        <CalendarDays className="w-8 h-8" />
                    </div>
                    <div className="text-center">
                        <h3 className="text-xl font-bold text-foreground">Split by Night</h3>
                        <p className="text-muted-foreground mt-2 text-sm max-w-[250px]">
                            Assign specific nights to individuals. Best if guests arrive or leave on different days.
                        </p>
                    </div>
                    {!splitEvenly && (
                        <div className="absolute top-4 right-4 h-6 w-6 rounded-full bg-rose-600 flex items-center justify-center text-white">
                            <ArrowRight className="w-4 h-4" />
                        </div>
                    )}
                </button>
            </div>

            {!isMobile && (
                <div className="mt-8">
                    <StepFooter
                        currentStep={currentStep}
                        totalSteps={totalSteps}
                        onNext={onNext}
                        onBack={onPrev}
                        nextDisabled={false}
                    />
                </div>
            )}
        </div>
    );
}
