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
            <div className="text-center mb-2">
                <div className="flex justify-center mb-4">
                    <div className="h-16 w-16 bg-green-100 rounded-full flex items-center justify-center text-green-600">
                        <Check className="h-8 w-8" />
                    </div>
                </div>
                <h2 className="text-2xl font-bold">Review & Finish</h2>
                <p className="text-muted-foreground mt-1">Here's the final breakdown for everyone.</p>
            </div>

            {!allItemsAssigned && (
                <Alert variant="destructive" className="bg-destructive/10 text-destructive border-none">
                    <AlertDescription>
                        Not all nights or fees are fully assigned. The totals below might not equal the grand total.
                        <Button variant="link" className="p-0 h-auto ml-2 text-destructive font-bold" onClick={onPrev}>Go back to fix</Button>
                    </AlertDescription>
                </Alert>
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
