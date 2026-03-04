import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { billService } from '@/services/billService';
import { useAuth } from '@/contexts/AuthContext';
import { arrayUnion, arrayRemove } from 'firebase/firestore';
import { Stepper, StepContent } from '@/components/ui/stepper';
import { PillProgress } from '@/components/ui/pill-progress';
import { SwipeableStepContainer } from '@/components/ui/swipeable-container';
import { AirbnbEntryStep } from './steps/AirbnbEntryStep';
import { PeopleStep } from '@/components/bill-wizard/steps/PeopleStep';
import { AssignmentStep } from '@/components/bill-wizard/steps/AssignmentStep';
import { ReviewStep } from '@/components/bill-wizard/steps/ReviewStep';
import { WizardNavigation } from '@/components/bill-wizard/WizardNavigation';
import { useBillWizard } from '@/components/bill-wizard/hooks/useBillWizard';
import { useBillSession } from '@/components/bill-wizard/hooks/useBillSession';
import { usePeopleManager } from '@/hooks/usePeopleManager';
import { useBillSplitter } from '@/hooks/useBillSplitter';
import { useIsMobile } from '@/hooks/use-mobile';
import { Person, BillData, ItemAssignment } from '@/types';
import { Step } from '@/components/bill-wizard/types';

const STEPS: Step[] = [
    { id: 1, label: 'Trip Details', description: 'Dates & Cost' },
    { id: 2, label: 'Guests', description: 'Add friends' },
    { id: 3, label: 'Assign', description: 'Split days' },
    { id: 4, label: 'Review', description: 'Finalize' },
];

interface AirbnbWizardProps {
    activeSession: any;
    billId?: string;
    saveSession: (data: any, id?: string) => Promise<string | null | void>;
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
    onEventChange
}: AirbnbWizardProps) {
    const navigate = useNavigate();
    const { user } = useAuth();
    const isMobile = useIsMobile();

    const [people, setPeople] = useState<Person[]>(initialPeople);
    const [billData, setBillData] = useState<BillData | null>(initialBillData);
    const [itemAssignments, setItemAssignments] = useState<ItemAssignment>(initialItemAssignments);
    const [splitEvenly, setSplitEvenly] = useState<boolean>(initialSplitEvenly);
    const [paidById, setPaidById] = useState<string | undefined>(activeSession?.paidById);

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

    const wizard = useBillWizard({
        billData,
        people,
        itemAssignments,
        totalSteps: STEPS.length,
        initialStep
    });

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
        paidById
    });

    const handleAtomicAssignment = (itemId: string, personId: string, checked: boolean) => {
        bill.handleItemAssignment(itemId, personId, checked);
        const id = billId || activeSession?.id;
        if (splitEvenly) {
            setSplitEvenly(false);
            if (id) billService.updateBill(id, { splitEvenly: false }).catch(console.error);
        }
        if (id) {
            billService.toggleItemAssignment(id, itemId, personId, checked).catch(console.error);
        }
    };

    const handleToggleSplitEvenly = () => {
        bill.toggleSplitEvenly();
        const newSplitEvenly = !splitEvenly;
        const newAssignments: ItemAssignment = {};
        if (newSplitEvenly && billData && people.length > 0) {
            billData.items.forEach(item => {
                newAssignments[item.id] = people.map(p => p.id);
            });
        }
        const id = billId || activeSession?.id;
        if (id) {
            billService.updateBill(id, {
                splitEvenly: newSplitEvenly,
                itemAssignments: newAssignments
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

    const handleAtomicPaidByChange = async (newPaidById: string) => {
        setPaidById(newPaidById);
        const id = billId || activeSession?.id;
        if (id) {
            billService.updateBill(id, { paidById: newPaidById }).catch(console.error);
        }
    };

    const handleAtomicAddFromFriend = (friend: any) => {
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
        if (targetEventId) {
            navigate(`/events/${targetEventId}`);
        } else {
            navigate('/dashboard');
        }
    };

    // Make mock upload functions that do nothing since we don't upload receipts in Airbnb flow
    const mockUpload = {
        imagePreview: null,
        selectedFile: null,
        isDragging: false,
        fileInputRef: { current: null },
        handleDragEnter: () => { },
        handleDragLeave: () => { },
        handleDragOver: () => { },
        handleDrop: () => { },
        handleFileSelect: () => { },
        handleRemoveImage: () => { },
        setImagePreview: () => { },
        setSelectedFile: () => { }
    };

    return (
        <>
            <div className="wizard-stepper">
                {isMobile ? (
                    <PillProgress
                        steps={STEPS}
                        currentStep={wizard.currentStep}
                        onStepClick={wizard.setCurrentStep}
                        canNavigateToStep={wizard.canNavigateToStep}
                    />
                ) : (
                    <Stepper
                        steps={STEPS}
                        currentStep={wizard.currentStep}
                        orientation="horizontal"
                        onStepClick={wizard.setCurrentStep}
                        canNavigateToStep={wizard.canNavigateToStep}
                    />
                )}
            </div>

            <SwipeableStepContainer
                onSwipeLeft={wizard.canProceedFromStep(wizard.currentStep) ? wizard.handleNextStep : undefined}
                onSwipeRight={wizard.currentStep > 0 ? wizard.handlePrevStep : undefined}
                canSwipeLeft={wizard.canProceedFromStep(wizard.currentStep)}
                canSwipeRight={wizard.currentStep > 0}
                className={isMobile ? 'pb-[140px] relative' : ''}
            >
                <StepContent stepKey={wizard.currentStep}>
                    {wizard.currentStep === 0 && (
                        <AirbnbEntryStep
                            billData={billData}
                            setBillData={setBillData}
                            onNext={wizard.handleNextStep}
                            canProceed={wizard.canProceedFromStep(0)}
                            currentStep={wizard.currentStep}
                            totalSteps={STEPS.length}
                            isMobile={isMobile}
                            onTriggerSave={executeSave}
                        />
                    )}

                    {wizard.currentStep === 1 && (
                        <PeopleStep
                            people={people}
                            setPeople={setPeople}
                            billData={billData}
                            newPersonName={peopleManager.newPersonName}
                            newPersonVenmoId={peopleManager.newPersonVenmoId}
                            onNameChange={peopleManager.setNewPersonName}
                            onVenmoIdChange={peopleManager.setNewPersonVenmoId}
                            isMobile={isMobile}
                            upload={mockUpload}
                            onAdd={handleAtomicAddPerson}
                            paidById={paidById}
                            onPaidByChange={handleAtomicPaidByChange}
                            onAddFromFriend={handleAtomicAddFromFriend}
                            onRemove={handleRemovePerson}
                            onUpdate={handleUpdatePerson}
                            onSaveAsFriend={peopleManager.savePersonAsFriend}
                            onRemoveFriend={peopleManager.removePersonFromFriends}
                            imagePreview={null}
                            selectedFile={null}
                            isUploading={false}
                            isAnalyzing={false}
                            receiptImageUrl={undefined}
                            onImageSelected={() => { }}
                            onAnalyze={() => { }}
                            onRemoveImage={() => { }}
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
                        <AssignmentStep
                            billData={billData}
                            setBillData={setBillData}
                            people={people}
                            itemAssignments={itemAssignments}
                            splitEvenly={splitEvenly}
                            onAssign={handleAtomicAssignment}
                            onToggleSplitEvenly={handleToggleSplitEvenly}
                            removePersonFromAssignments={bill.removePersonFromAssignments}
                            removeItemAssignments={bill.removeItemAssignments}
                            imagePreview={null}
                            selectedFile={null}
                            isUploading={false}
                            isAnalyzing={false}
                            isAIProcessing={false}
                            receiptImageUrl={undefined}
                            onImageSelected={() => { }}
                            onAnalyze={() => { }}
                            onRemoveImage={() => { }}
                            onNext={wizard.handleNextStep}
                            onPrev={wizard.handlePrevStep}
                            canProceed={wizard.canProceedFromStep(2)}
                            currentStep={wizard.currentStep}
                            totalSteps={STEPS.length}
                            isMobile={isMobile}
                            upload={mockUpload}
                            onTriggerSave={executeSave}
                        />
                    )}

                    {wizard.currentStep === 3 && (
                        <ReviewStep
                            billId={billId || activeSession?.id}
                            billData={billData}
                            people={people}
                            itemAssignments={itemAssignments}
                            personTotals={bill.personTotals}
                            allItemsAssigned={bill.allItemsAssigned}
                            settledPersonIds={activeSession?.settledPersonIds || []}
                            paidById={paidById}
                            ownerId={activeSession?.ownerId || user?.uid}
                            receipt={{
                                imagePreview: null,
                                selectedFile: null,
                                isUploading: false,
                                isAnalyzing: false,
                                receiptImageUrl: undefined,
                                onImageSelected: () => { },
                                onAnalyze: () => { },
                                onRemoveImage: () => { },
                                isMobile,
                                upload: mockUpload,
                            }}
                            onComplete={handleDone}
                            onPrev={wizard.handlePrevStep}
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
                    onBack={wizard.handlePrevStep}
                    onNext={wizard.handleNextStep}
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
