import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { billService } from '@/services/billService';
import { useAuth } from '@/contexts/AuthContext';
import { arrayUnion, arrayRemove } from 'firebase/firestore';
import { Stepper, StepContent } from '@/components/ui/stepper';
import { PillProgress } from '@/components/ui/pill-progress';
import { SwipeableStepContainer } from '@/components/ui/swipeable-container';
import { AirbnbEntryStep } from './steps/AirbnbEntryStep';
import { AirbnbGuestsStep } from './steps/AirbnbGuestsStep';
import { AirbnbSplitMethodStep } from './steps/AirbnbSplitMethodStep';
import { AirbnbAssignStep } from './steps/AirbnbAssignStep';
import { AirbnbReviewStep } from './steps/AirbnbReviewStep';
import { WizardNavigation } from '@/components/bill-wizard/WizardNavigation';
import { useBillWizard } from '@/components/bill-wizard/hooks/useBillWizard';
import { useBillSession } from '@/components/bill-wizard/hooks/useBillSession';
import { usePeopleManager } from '@/hooks/usePeopleManager';
import { useBillSplitter } from '@/hooks/useBillSplitter';
import { useIsMobile } from '@/hooks/use-mobile';
import { Person, BillData, ItemAssignment } from '@/types';
import { Bill } from '@/types/bill.types';
import { Step } from '@/components/bill-wizard/types';

interface AirbnbWizardProps {
    activeSession: Bill | null;
    billId?: string;
    saveSession: (data: Partial<Bill>, id?: string) => Promise<string | null | void>;
    deleteSession?: (id: string) => Promise<void>;
    initialBillData: BillData | null;
    initialPeople: Person[];
    initialItemAssignments: ItemAssignment;
    initialSplitEvenly: boolean;
    initialTitle: string;
    initialStep?: number;
    title: string;
    onTitleChange: (title: string) => void;
    hasBillData: boolean;
    onShare?: () => void;
    eventId?: string | null;
    onEventChange?: (eventId: string | null) => void;
    initialAirbnbData?: Bill['airbnbData'];
}

export function AirbnbWizard({
    activeSession,
    billId,
    saveSession,
    deleteSession,
    initialBillData,
    initialPeople,
    initialItemAssignments,
    initialSplitEvenly,
    initialTitle,
    initialStep = 0,
    title,
    onTitleChange,
    hasBillData,
    onShare,
    eventId,
    onEventChange,
    initialAirbnbData
}: AirbnbWizardProps) {
    const navigate = useNavigate();
    const { user } = useAuth();
    const isMobile = useIsMobile();
    const isOwner = !activeSession || !activeSession.ownerId || activeSession.ownerId === user?.uid;

    const [people, setPeople] = useState<Person[]>(initialPeople);
    const [billData, setBillData] = useState<BillData | null>(initialBillData);
    const [itemAssignments, setItemAssignments] = useState<ItemAssignment>(initialItemAssignments);
    const [splitEvenly, setSplitEvenly] = useState<boolean>(initialSplitEvenly);
    const [paidById, setPaidById] = useState<string | undefined>(activeSession?.paidById);
    const [airbnbData, setAirbnbData] = useState<Bill['airbnbData']>(initialAirbnbData);

    const peopleManager = usePeopleManager(people, setPeople);
    const bill = useBillSplitter({
        people,
        billData,
        setBillData,
        itemAssignments,
        setItemAssignments,
        splitEvenly,
        setSplitEvenly,
    });

    useEffect(() => {
        if (initialItemAssignments) setItemAssignments(initialItemAssignments);
    }, [initialItemAssignments]);

    useEffect(() => {
        if (initialPeople) setPeople(initialPeople);
    }, [initialPeople]);

    useEffect(() => {
        if (activeSession?.paidById && paidById !== activeSession.paidById) {
            setPaidById(activeSession.paidById);
        }
    }, [activeSession?.paidById]);

    useEffect(() => {
        if (initialAirbnbData) setAirbnbData(initialAirbnbData);
    }, [initialAirbnbData]);

    const STEPS: Step[] = splitEvenly ? [
        { id: 1, label: 'Details', description: 'Dates & Cost' },
        { id: 2, label: 'Guests', description: 'Add guests' },
        { id: 3, label: 'Method', description: 'How to split' },
        { id: 4, label: 'Review', description: 'Finalize' },
    ] : [
        { id: 1, label: 'Details', description: 'Dates & Cost' },
        { id: 2, label: 'Guests', description: 'Add guests' },
        { id: 3, label: 'Method', description: 'How to split' },
        { id: 4, label: 'Assign', description: 'Nights' },
        { id: 5, label: 'Review', description: 'Finalize' },
    ];

    const customValidator = useCallback((step: number) => {
        if (splitEvenly) {
            // STEPS: Details (0), Guests (1), Method (2), Review (3)
            switch (step) {
                case 0: return !!(billData?.items && billData.items.length > 0 && billData.subtotal > 0);
                case 1: return people.length > 0;
                case 2: return true; // Method choice is always valid
                case 3: return true;
                default: return false;
            }
        } else {
            // STEPS: Details (0), Guests (1), Method (2), Assign (3), Review (4)
            switch (step) {
                case 0: return !!(billData?.items && billData.items.length > 0 && billData.subtotal > 0);
                case 1: return people.length > 0;
                case 2: return true; // Method choice is always valid
                case 3: return bill.allItemsAssigned;
                case 4: return true;
                default: return false;
            }
        }
    }, [splitEvenly, billData, people, bill.allItemsAssigned]);

    const derivedMinStep = isOwner ? 0 : (splitEvenly ? STEPS.length - 1 : STEPS.length - 2);
    const derivedInitialStep = isOwner ? initialStep : derivedMinStep;

    const wizard = useBillWizard({
        billData,
        people,
        itemAssignments,
        totalSteps: STEPS.length,
        initialStep: derivedInitialStep,
        minStep: derivedMinStep,
        customValidator
    });

    // Make sure wizard.currentStep doesn't exceed new STEPS length if we toggled split evenly
    useEffect(() => {
        if (wizard.currentStep >= STEPS.length) {
            wizard.setCurrentStep(STEPS.length - 1);
        }
    }, [splitEvenly, STEPS.length, wizard.currentStep]);

    // Ensure itemAssignments are kept flawlessly in sync if splitEvenly is true
    // This covers default values, adding/removing guests, or editing items
    useEffect(() => {
        if (splitEvenly && billData && billData.items && people.length > 0) {
            const allPeopleIds = people.map(p => p.id);
            let needsUpdate = false;

            // Check if any item is missing an assignment or has wrong number of people
            for (const item of billData.items) {
                const assigned = itemAssignments[item.id];
                if (!assigned || assigned.length !== allPeopleIds.length) {
                    needsUpdate = true;
                    break;
                }
            }

            if (needsUpdate) {
                const newAssignments: ItemAssignment = {};
                billData.items.forEach(item => {
                    newAssignments[item.id] = [...allPeopleIds];
                });
                setItemAssignments(newAssignments);

                // Fire off a background save if it's not a brand new draft
                const id = billId || activeSession?.id;
                if (id) {
                    billService.updateBill(id, { itemAssignments: newAssignments }).catch(console.error);
                }
            }
        }
    }, [splitEvenly, billData, people, itemAssignments, billId, activeSession?.id]);

    const { executeSave } = useBillSession({
        billData,
        people,
        itemAssignments,
        splitEvenly,
        currentStep: wizard.currentStep,
        title,
        activeSession,
        billId,
        saveSession,
        paidById,
        baseUrl: '/airbnb',
        isAirbnb: true,
        airbnbData
    });

    const handleAtomicAssignment = (itemId: string, personId: string, checked: boolean) => {
        bill.handleItemAssignment(itemId, personId, checked);
        const id = billId || activeSession?.id;
        if (id) {
            billService.toggleItemAssignment(id, itemId, personId, checked).catch(console.error);
        }
    };

    const handleToggleSplitEvenly = (evenly: boolean) => {
        if (splitEvenly === evenly) return;

        setSplitEvenly(evenly);

        const newAssignments: ItemAssignment = {};
        if (evenly && billData && people.length > 0) {
            billData.items.forEach(item => {
                newAssignments[item.id] = people.map(p => p.id);
            });
            setItemAssignments(newAssignments);
        } else {
            setItemAssignments({});
        }

        const id = billId || activeSession?.id;
        if (id) {
            billService.updateBill(id, {
                splitEvenly: evenly,
                itemAssignments: evenly ? newAssignments : {}
            }).catch(console.error);
        }
    };

    const handleAtomicAddPerson = async (name?: string, venmoId?: string) => {
        const newPerson = await peopleManager.addPerson(name, venmoId);
        if (newPerson) {
            const id = billId || activeSession?.id;
            if (id) {
                billService.updateBill(id, {
                    people: arrayUnion(newPerson) as unknown as Person[]
                }).catch(console.error);
            }
        }
    };

    const handleAtomicAddFromFriend = (friend: { id?: string; name: string; venmoId?: string }) => {
        const newPerson = peopleManager.addFromFriend(friend);
        if (newPerson) {
            const id = billId || activeSession?.id;
            if (id) {
                billService.updateBill(id, {
                    people: arrayUnion(newPerson) as unknown as Person[]
                }).catch(console.error);
            }
        }
    };

    const handleRemovePerson = async (personId: string) => {
        peopleManager.removePerson(personId);
        bill.removePersonFromAssignments(personId);
        const id = billId || activeSession?.id;
        if (id) {
            const personToRemove = people.find(p => p.id === personId);
            if (personToRemove) {
                try {
                    const updatedPeople = people.filter(p => p.id !== personId);
                    await billService.updateBill(id, { people: updatedPeople });
                } catch (e) {
                    console.error("Failed to remove person", e);
                }
            }
        }
    };

    const handleUpdatePerson = async (personId: string, updates: Partial<Person>) => {
        const updatedPeople = people.map(p =>
            p.id === personId ? { ...p, ...updates } : p
        );
        setPeople(updatedPeople);
        const id = billId || activeSession?.id;
        if (id) {
            await billService.updatePersonDetails(id, personId, updates).catch(console.error);
        }
    };

    const { state: routerState } = useLocation();
    const targetEventId = activeSession?.eventId || routerState?.targetEventId;

    const handleDone = async () => {
        // Set the bill status to 'active' on completion
        const id = billId || activeSession?.id;
        if (id) {
            try {
                await billService.updateBill(id, { status: 'active' });
            } catch (e) {
                console.error("Failed to mark bill as active", e);
            }
        }

        if (targetEventId) {
            navigate(`/events/${targetEventId}`);
        } else {
            navigate('/dashboard');
        }
    };

    const handleNext = () => {
        if (!isOwner && wizard.currentStep === STEPS.length - 1) {
             handleDone();
             return;
        }
        wizard.handleNextStep();
    }

    const canNavigateToStep = (step: number) => {
        if (!isOwner) {
            const minStep = splitEvenly ? STEPS.length - 1 : STEPS.length - 2;
            if (step < minStep) return false;
            if (step === STEPS.length - 1 && !wizard.canProceedFromStep(STEPS.length - 2)) return false;
            return true;
        }
        return wizard.canNavigateToStep(step);
    };

    const canSwipeRight = () => {
        if (!isOwner) {
            const minStep = splitEvenly ? STEPS.length - 1 : STEPS.length - 2;
            return wizard.currentStep > minStep;
        }
        return wizard.currentStep > 0;
    };

    // Derived flags for rendering
    const isReviewStep = wizard.currentStep === STEPS.length - 1;
    const isAssignStep = !splitEvenly && wizard.currentStep === 3;

    return (
        <>
            <div className="wizard-stepper">
                {isMobile ? (
                    <PillProgress
                        steps={STEPS}
                        currentStep={wizard.currentStep}
                        onStepClick={(s) => canNavigateToStep(s) && wizard.setCurrentStep(s)}
                        canNavigateToStep={canNavigateToStep}
                    />
                ) : (
                    <Stepper
                        steps={STEPS}
                        currentStep={wizard.currentStep}
                        orientation="horizontal"
                        onStepClick={(s) => canNavigateToStep(s) && wizard.setCurrentStep(s)}
                        canNavigateToStep={canNavigateToStep}
                    />
                )}
            </div>

            <SwipeableStepContainer
                onSwipeLeft={wizard.canProceedFromStep(wizard.currentStep) ? handleNext : undefined}
                onSwipeRight={canSwipeRight() ? wizard.handlePrevStep : undefined}
                canSwipeLeft={wizard.canProceedFromStep(wizard.currentStep)}
                canSwipeRight={canSwipeRight()}
                className={isMobile ? 'pb-[140px] relative' : ''}
            >
                <StepContent stepKey={wizard.currentStep}>
                    {wizard.currentStep === 0 && (
                        <AirbnbEntryStep
                            billData={billData}
                            setBillData={setBillData}
                            airbnbData={airbnbData}
                            setAirbnbData={setAirbnbData}
                            onNext={wizard.handleNextStep}
                            canProceed={wizard.canProceedFromStep(0)}
                            currentStep={wizard.currentStep}
                            totalSteps={STEPS.length}
                            isMobile={isMobile}
                            onTriggerSave={executeSave}
                        />
                    )}

                    {wizard.currentStep === 1 && (
                        <AirbnbGuestsStep
                            people={people}
                            setPeople={setPeople}
                            billData={billData}
                            isMobile={isMobile}
                            onAdd={handleAtomicAddPerson}
                            onAddFromFriend={handleAtomicAddFromFriend}
                            onRemove={handleRemovePerson}
                            onUpdate={handleUpdatePerson}
                            onNext={wizard.handleNextStep}
                            onPrev={wizard.handlePrevStep}
                            canProceed={wizard.canProceedFromStep(1)}
                            currentStep={wizard.currentStep}
                            totalSteps={STEPS.length}
                            eventId={eventId}
                            onEventChange={onEventChange}
                        />
                    )}

                    {wizard.currentStep === 2 && (
                        <AirbnbSplitMethodStep
                            splitEvenly={splitEvenly}
                            onToggleSplitEvenly={handleToggleSplitEvenly}
                            onNext={handleNext}
                            onPrev={wizard.handlePrevStep}
                            currentStep={wizard.currentStep}
                            totalSteps={STEPS.length}
                            isMobile={isMobile}
                        />
                    )}

                    {isAssignStep && (
                        <AirbnbAssignStep
                            billData={billData}
                            people={people}
                            itemAssignments={itemAssignments}
                            onAssign={handleAtomicAssignment}
                            onNext={handleNext}
                            onPrev={canSwipeRight() ? wizard.handlePrevStep : undefined}
                            canProceed={wizard.canProceedFromStep(3)}
                            currentStep={wizard.currentStep}
                            totalSteps={STEPS.length}
                            isMobile={isMobile}
                            isOwner={isOwner}
                            currentUserId={user?.uid}
                        />
                    )}

                    {isReviewStep && (
                        <AirbnbReviewStep
                            billId={billId || activeSession?.id}
                            billData={billData}
                            people={people}
                            itemAssignments={itemAssignments}
                            personTotals={bill.personTotals}
                            allItemsAssigned={bill.allItemsAssigned}
                            settledPersonIds={activeSession?.settledPersonIds || []}
                            paidById={paidById}
                            ownerId={activeSession?.ownerId || user?.uid}
                            onComplete={handleDone}
                            onPrev={canSwipeRight() ? wizard.handlePrevStep : undefined}
                            currentStep={wizard.currentStep}
                            totalSteps={STEPS.length}
                        />
                    )}
                </StepContent>
            </SwipeableStepContainer>

            {isMobile && (
                <WizardNavigation
                    currentStep={wizard.currentStep}
                    totalSteps={STEPS.length}
                    onBack={canSwipeRight() ? wizard.handlePrevStep : undefined}
                    onNext={handleNext}
                    onComplete={handleDone}
                    onExit={handleDone}
                    exitLabel={targetEventId ? 'Event' : 'Dashboard'}
                    nextDisabled={!wizard.canProceedFromStep(wizard.currentStep)}
                    hasBillData={hasBillData}
                    onShare={onShare}
                    isMobile={isMobile}
                />
            )}
        </>
    );
}
