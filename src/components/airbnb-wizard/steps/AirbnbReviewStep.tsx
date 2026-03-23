import { Card } from '@/components/ui/card';
import { BillData, Person, ItemAssignment, PersonTotal } from '@/types';
import { Button } from '@/components/ui/button';
import { Check, Edit2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { SplitSummary } from '@/components/people/SplitSummary';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { billService } from '@/services/billService';
import { arrayUnion, arrayRemove } from 'firebase/firestore';
import { SplitDonutChart } from '@/components/shared/SplitDonutChart';

interface AirbnbReviewStepProps {
    billId?: string;
    billData: BillData | null;
    people: Person[];
    itemAssignments: ItemAssignment;
    personTotals: PersonTotal[];
    allItemsAssigned: boolean;
    settledPersonIds?: string[];
    paidById?: string;
    ownerId?: string;
    onComplete: () => void;
    onPrev: () => void;
    currentStep: number;
    totalSteps: number;
}

export function AirbnbReviewStep({
    billId,
    billData,
    people,
    itemAssignments,
    personTotals,
    allItemsAssigned,
    settledPersonIds = [],
    paidById,
    ownerId,
    onComplete,
    onPrev,
}: AirbnbReviewStepProps) {
    const { user } = useAuth();
    const { toast } = useToast();

    if (!billData) return null;

    const handleMarkAsSettled = async (personId: string, isSettled: boolean) => {
        if (!user || !billId) return;

        try {
            await billService.updateBill(billId, {
                settledPersonIds: (isSettled ? arrayUnion(personId) : arrayRemove(personId)) as unknown as string[]
            });

            toast({
                title: isSettled ? "Marked as Settled" : "Undo Settled",
                description: isSettled ? "Their balance has been updated to $0 for this trip." : "Their balance has been restored.",
            });

        } catch (error) {
            console.error("Failed to mark as settled", error);
            toast({
                title: "Error",
                description: "Failed to mark as settled. Please try again.",
                variant: "destructive"
            });
            throw error;
        }
    };

    return (
        <div className="flex flex-col gap-6 fade-in max-w-xl mx-auto w-full pb-20">
            <div className="text-center mb-2" />

            {!allItemsAssigned && (
                <Alert variant="destructive" className="bg-destructive/10 text-destructive border-none">
                    <AlertDescription>
                        Not all nights or fees are fully assigned. The totals below might not equal the grand total.
                        <Button variant="link" className="p-0 h-auto ml-2 text-destructive font-bold" onClick={onPrev}>Go back to fix</Button>
                    </AlertDescription>
                </Alert>
            )}

            {allItemsAssigned && personTotals.length > 1 && (
                <SplitDonutChart
                    personTotals={personTotals}
                    total={billData.total}
                />
            )}

            <SplitSummary
                personTotals={personTotals}
                allItemsAssigned={allItemsAssigned}
                people={people}
                billData={billData}
                itemAssignments={itemAssignments}
                billName={billData.restaurantName}
                settledPersonIds={settledPersonIds}
                paidById={paidById}
                ownerId={ownerId}
                onMarkAsSettled={handleMarkAsSettled}
            />

        </div>
    );
}
