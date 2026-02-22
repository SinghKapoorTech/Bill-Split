import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { billService } from '@/services/billService';
import { arrayUnion, arrayRemove } from 'firebase/firestore';
import { Stepper, StepContent } from '@/components/ui/stepper';
import { PillProgress } from '@/components/ui/pill-progress';
import { SwipeableStepContainer, useSwipeNavigation } from '@/components/ui/swipeable-container';
import { BillEntryStep } from './steps/BillEntryStep';
import { PeopleStep } from './steps/PeopleStep';
import { AssignmentStep } from './steps/AssignmentStep';
import { ReviewStep } from './steps/ReviewStep';
import { WizardNavigation } from './WizardNavigation';
import { useBillWizard } from './hooks/useBillWizard';
import { useBillSession } from './hooks/useBillSession';
import { usePeopleManager } from '@/hooks/usePeopleManager';
import { useBillSplitter } from '@/hooks/useBillSplitter';
import { useReceiptAnalyzer } from '@/hooks/useReceiptAnalyzer';
import { useFileUpload } from '@/hooks/useFileUpload';
import { useIsMobile } from '@/hooks/use-mobile';
import { Person, BillData, ItemAssignment } from '@/types';
import { Step } from './types';
import { ScanSuccessAnimation } from '@/components/shared/ScanSuccessAnimation';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ui/alert-dialog';

const STEPS: Step[] = [
    { id: 1, label: 'Bill Entry', description: 'Add items' },
    { id: 2, label: 'People', description: 'Add friends' },
    { id: 3, label: 'Assign', description: 'Split items' },
    { id: 4, label: 'Review', description: 'Finalize' },
];

interface BillWizardProps {
    // Session context
    activeSession: any;
    billId?: string;
    isUploading: boolean;
    uploadReceiptImage: (file: File) => Promise<any>;
    saveSession: (data: any, id?: string) => void;
    removeReceiptImage: () => Promise<void>;
    deleteSession?: (id: string, receiptFileName?: string) => Promise<void>;

    // Initial data
    initialBillData: BillData | null;
    initialPeople: Person[];
    initialItemAssignments: ItemAssignment;
    initialSplitEvenly: boolean;
    initialTitle: string;
    initialStep?: number;

    // Controlled title (so parent can track updates)
    title: string;
    onTitleChange: (title: string) => void;

    // Share functionality (for mobile navigation)
    hasBillData: boolean;
    onShare?: () => void;
}

/**
 * Bill Wizard Container
 * Orchestrates the 4-step bill creation flow
 * Replaces the main content of AIScanView
 */
export function BillWizard({
    activeSession,
    billId,
    isUploading,
    uploadReceiptImage,
    saveSession,
    removeReceiptImage,
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
    onShare
}: BillWizardProps) {
    const navigate = useNavigate();
    const isMobile = useIsMobile();

    // State
    const [people, setPeople] = useState<Person[]>(initialPeople);
    const [billData, setBillData] = useState<BillData | null>(initialBillData);
    const [itemAssignments, setItemAssignments] = useState<ItemAssignment>(initialItemAssignments);
    const [splitEvenly, setSplitEvenly] = useState<boolean>(initialSplitEvenly);
    const [showClearItemsDialog, setShowClearItemsDialog] = useState(false);
    const [isAIProcessing, setIsAIProcessing] = useState(false);
    const [showSuccessAnimation, setShowSuccessAnimation] = useState(false);

    // Hooks
    const upload = useFileUpload();
    const analyzer = useReceiptAnalyzer(setBillData, setPeople, billData);
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

    // Validating and syncing props to state for real-time updates
    useEffect(() => {
        // We only sync assignments and people to avoid interrupting bill editing
        if (initialItemAssignments) {
            setItemAssignments(initialItemAssignments);
        }
    }, [initialItemAssignments]);

    useEffect(() => {
        if (initialPeople) {
            setPeople(initialPeople);
        }
    }, [initialPeople]);

    // Initialize receipt image preview from session if exists
    useEffect(() => {
        if (activeSession?.receiptImageUrl && !upload.imagePreview) {
            upload.setImagePreview(activeSession.receiptImageUrl);
        }
    }, [activeSession?.receiptImageUrl]);

    const wizard = useBillWizard({
        billData,
        people,
        itemAssignments,
        totalSteps: STEPS.length,
        initialStep
    });

    useBillSession({
        billData,
        people,
        itemAssignments,
        splitEvenly,
        currentStep: wizard.currentStep,
        title,
        activeSession,
        billId,
        receiptImageUrl: activeSession?.receiptImageUrl,
        receiptFileName: activeSession?.receiptFileName,
        saveSession
    });

    const handleAtomicAssignment = (itemId: string, personId: string, checked: boolean) => {
        // Optimistic UI update
        bill.handleItemAssignment(itemId, personId, checked);
        
        const id = billId || activeSession?.id;
        
        if (splitEvenly) {
            setSplitEvenly(false);
            if (id) {
                billService.updateBill(id, { splitEvenly: false }).catch(console.error);
            }
        }
        
        // Atomic Firestore update
        if (id) {
            billService.toggleItemAssignment(id, itemId, personId, checked).catch(console.error);
        }
    };

    const handleToggleSplitEvenly = () => {
        // Optimistic UI update
        bill.toggleSplitEvenly();
        
        // Atomic Firestore update
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

    const handleAtomicAddPerson = async () => {
        const newPerson = await peopleManager.addPerson();
         if (newPerson) {
            const id = billId || activeSession?.id;
            if (id) {
                 billService.updateBill(id, { 
                     people: arrayUnion(newPerson) as unknown as Person[] 
                 }).catch(console.error);
            }
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

    // Event handlers
    const handleRemovePerson = async (personId: string) => {
        // 1. Optimistic update
        peopleManager.removePerson(personId);
        bill.removePersonFromAssignments(personId);

        // 2. Atomic Firestore update
        const id = billId || activeSession?.id;
        if (id) {
             // We need to find the person object to remove it from the array
             // Since firestore arrayRemove requires the exact object, this is tricky if we don't have it.
             // However, we can read the current state or just filter and update the whole array.
             // Given we want to be safe, let's filter and update the people array.
             // But wait, arrayRemove is better for concurrency. 
             // THE PROBLEM: Person objects might have changed properties? No, usually not in this flow.
             // actually, peopleManager.removePerson updates local state.
             // To be safe and simple: Filter the local 'people' (before removal) and update the whole array.
             // Although arrayRemove is atomic, we'd need the exact object instance.
             // Let's use the 'update whole array' approach for people list as it's small and safer for now,
             // creating a read-modify-write pattern (or just write if we trust local state, but local state is now updated).
             // Actually, we should use the `people` state *before* it was updated? Or just filter it here.
             
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
        // Optimistic update
        const updatedPeople = people.map(p => 
            p.id === personId ? { ...p, ...updates } : p
        );
        setPeople(updatedPeople);
        
        // Atomic update via service
        const id = billId || activeSession?.id;
        if (id) {
            await billService.updatePersonDetails(id, personId, updates).catch(console.error);
        }
    };

    const handleRemoveImage = async () => {
        if (billData?.items && billData.items.length > 0) {
            setShowClearItemsDialog(true);
            return;
        }
        await performImageRemoval(true);
    };

    const performImageRemoval = async (clearItems: boolean) => {
        upload.handleRemoveImage();
        await removeReceiptImage();

        if (clearItems) {
            setBillData(null);
            await saveSession({
                billData: null,
                people,
                itemAssignments: {},
                splitEvenly,
                currentStep: 0,
                title: title || undefined,
            }, billId || activeSession?.id);
        } else {
            await saveSession({
                billData,
                people,
                itemAssignments,
                splitEvenly,
                currentStep: 0,
                title: title || undefined,
            }, billId || activeSession?.id);
        }

        wizard.setCurrentStep(0);
    };

    const handleAnalyzeReceipt = async () => {
        if (!upload.imagePreview || !upload.selectedFile) {
            console.error("Cannot analyze: image preview or file is missing.");
            return;
        }

        setIsAIProcessing(true);

        // Start both operations in parallel (skip upload if auto-upload already finished)
        const analysisPromise = analyzer.analyzeReceipt(upload.selectedFile, upload.imagePreview);
        const uploadPromise = !activeSession?.receiptImageUrl
            ? uploadReceiptImage(upload.selectedFile)
            : Promise.resolve({
                  downloadURL: activeSession.receiptImageUrl,
                  fileName: activeSession.receiptFileName
              });

        // Wait for both to complete (no early navigation)
        try {
            const [analyzedBillData, uploadResult] = await Promise.all([analysisPromise, uploadPromise]);

            if (!analyzedBillData) {
                throw new Error('Receipt analysis failed');
            }

            // Show success animation (navigation happens in onComplete callback)
            setShowSuccessAnimation(true);

            // Update title from restaurant name if no title exists
            let newTitle: string = title || '';
            if (!title && analyzedBillData?.restaurantName) {
                newTitle = analyzedBillData.restaurantName;
                onTitleChange(newTitle);
            }

            const savePayload: any = {
                billData: analyzedBillData,
                people,
                itemAssignments,
                splitEvenly,
            };

            if (uploadResult?.downloadURL) {
                savePayload.receiptImageUrl = uploadResult.downloadURL;
            }
            if (uploadResult?.fileName) {
                savePayload.receiptFileName = uploadResult.fileName;
            }

            const titleToSave = analyzedBillData?.restaurantName && !title
                ? analyzedBillData.restaurantName
                : title;
            if (titleToSave) {
                savePayload.title = titleToSave;
            }

            await saveSession(savePayload, billId || activeSession?.id);

            // Navigate to People step after save completes
            wizard.setCurrentStep(1);

        } catch (error) {
            console.error('Receipt analysis failed:', error);
            // Stay on upload step (don't navigate away)
        } finally {
            setIsAIProcessing(false);
        }
    };


    const handleImageSelected = async (fileOrBase64: File | string) => {
        let fileToUpload: File;
        if (typeof fileOrBase64 === 'string') {
            upload.setImagePreview(fileOrBase64);
            const response = await fetch(fileOrBase64);
            const blob = await response.blob();
            fileToUpload = new File([blob], 'receipt.jpg', { type: blob.type });
            upload.setSelectedFile(fileToUpload);
        } else {
            upload.handleFileSelect(fileOrBase64);
            fileToUpload = fileOrBase64;
        }
        
        // Auto-upload in background so it's not lost on exit
        const id = billId || activeSession?.id;
        if (id) {
            uploadReceiptImage(fileToUpload)
                .then(uploadResult => {
                    if (uploadResult?.downloadURL) {
                        saveSession({
                            receiptImageUrl: uploadResult.downloadURL,
                            receiptFileName: uploadResult.fileName
                        }, id);
                    }
                })
                .catch(e => console.error("Auto-upload failed:", e));
        }
    };

    const handleDone = async () => {
        const isEmpty = !billData?.items || billData.items.length === 0;
        const hasNoReceiptFile = !activeSession?.receiptFileName && !upload.selectedFile && !upload.imagePreview;

        if (isEmpty && hasNoReceiptFile && activeSession?.id && deleteSession) {
            await deleteSession(activeSession.id, activeSession.receiptFileName);
        }

        if (activeSession?.eventId) {
            navigate(`/events/${activeSession.eventId}`);
        } else {
            navigate('/dashboard');
        }
    };

    return (
        <>
            {/* Success Animation Overlay */}
            <ScanSuccessAnimation
                show={showSuccessAnimation}
                onComplete={() => setShowSuccessAnimation(false)}
            />

            {/* Stepper - Use PillProgress on mobile for modern look */}
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

            {/* Bottom padding spacer for fixed mobile navigation */}
            {isMobile && <div className="h-4" />}

            {/* Step Content - with bottom padding for fixed navigation on mobile */}
            {/* Wrap in SwipeableStepContainer on mobile for gesture navigation */}
            <SwipeableStepContainer
                onSwipeLeft={wizard.canProceedFromStep(wizard.currentStep) ? wizard.handleNextStep : undefined}
                onSwipeRight={wizard.currentStep > 0 ? wizard.handlePrevStep : undefined}
                canSwipeLeft={wizard.canProceedFromStep(wizard.currentStep)}
                canSwipeRight={wizard.currentStep > 0}
                className={isMobile ? 'pb-[140px] relative' : ''}
            >
                <StepContent stepKey={wizard.currentStep}>
                    {wizard.currentStep === 0 && (
                        <BillEntryStep
                            billData={billData}
                            setBillData={setBillData}
                            imagePreview={upload.imagePreview}
                            selectedFile={upload.selectedFile}
                            isUploading={isUploading}
                            isAnalyzing={analyzer.isAnalyzing}
                            receiptImageUrl={activeSession?.receiptImageUrl}
                            onAnalyze={handleAnalyzeReceipt}
                            onRemoveImage={handleRemoveImage}
                            onImageSelected={handleImageSelected}
                            onNext={wizard.handleNextStep}
                            canProceed={wizard.canProceedFromStep(0)}
                            currentStep={wizard.currentStep}
                            totalSteps={STEPS.length}
                            isMobile={isMobile}
                            removeItemAssignments={bill.removeItemAssignments}
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
                            upload={upload}
                            // Atomic handlers
                            onAdd={handleAtomicAddPerson}
                            onAddFromFriend={handleAtomicAddFromFriend}
                            onRemove={handleRemovePerson}
                            onUpdate={handleUpdatePerson}
                            onSaveAsFriend={peopleManager.savePersonAsFriend}
                            imagePreview={upload.imagePreview}
                            selectedFile={upload.selectedFile}
                            isUploading={isUploading}
                            isAnalyzing={analyzer.isAnalyzing}
                            receiptImageUrl={activeSession?.receiptImageUrl}
                            onImageSelected={handleImageSelected}
                            onAnalyze={handleAnalyzeReceipt}
                            onRemoveImage={handleRemoveImage}
                            onNext={wizard.handleNextStep}
                            onPrev={wizard.handlePrevStep}
                            canProceed={wizard.canProceedFromStep(1)}
                            currentStep={wizard.currentStep}
                            totalSteps={STEPS.length}
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
                            imagePreview={upload.imagePreview}
                            selectedFile={upload.selectedFile}
                            isUploading={isUploading}
                            isAnalyzing={analyzer.isAnalyzing}
                            isAIProcessing={isAIProcessing}
                            receiptImageUrl={activeSession?.receiptImageUrl}
                            onImageSelected={handleImageSelected}
                            onAnalyze={handleAnalyzeReceipt}
                            onRemoveImage={handleRemoveImage}
                            onNext={wizard.handleNextStep}
                            onPrev={wizard.handlePrevStep}
                            canProceed={wizard.canProceedFromStep(2)}
                            currentStep={wizard.currentStep}
                            totalSteps={STEPS.length}
                            isMobile={isMobile}
                            upload={upload}
                        />
                    )}

                    {wizard.currentStep === 3 && (
                        <ReviewStep
                            billData={billData}
                            people={people}
                            itemAssignments={itemAssignments}
                            personTotals={bill.personTotals}
                            allItemsAssigned={bill.allItemsAssigned}
                            imagePreview={upload.imagePreview}
                            selectedFile={upload.selectedFile}
                            isUploading={isUploading}
                            isAnalyzing={analyzer.isAnalyzing}
                            receiptImageUrl={activeSession?.receiptImageUrl}
                            onImageSelected={handleImageSelected}
                            onAnalyze={handleAnalyzeReceipt}
                            onRemoveImage={handleRemoveImage}
                            onComplete={handleDone}
                            onPrev={wizard.handlePrevStep}
                            currentStep={wizard.currentStep}
                            totalSteps={STEPS.length}
                            isMobile={isMobile}
                            upload={upload}
                        />
                    )}
                </StepContent>
            </SwipeableStepContainer>

            {/* Mobile Navigation (fixed at bottom) */}
            {isMobile && (
                <WizardNavigation
                    currentStep={wizard.currentStep}
                    totalSteps={STEPS.length}
                    onBack={wizard.handlePrevStep}
                    onNext={wizard.handleNextStep}
                    onComplete={handleDone}
                    onExit={handleDone}
                    nextDisabled={!wizard.canProceedFromStep(wizard.currentStep)}
                    hasBillData={hasBillData}
                    onShare={onShare}
                    isMobile={isMobile}
                />
            )}

            {/* Clear Items Dialog */}
            <AlertDialog open={showClearItemsDialog} onOpenChange={setShowClearItemsDialog}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Remove Receipt?</AlertDialogTitle>
                        <AlertDialogDescription>
                            You have bill items. Do you want to keep them or clear them when removing the receipt?
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel onClick={() => setShowClearItemsDialog(false)}>
                            Cancel
                        </AlertDialogCancel>
                        <AlertDialogAction onClick={() => {
                            performImageRemoval(false);
                            setShowClearItemsDialog(false);
                        }}>
                            Keep Items
                        </AlertDialogAction>
                        <AlertDialogAction onClick={() => {
                            performImageRemoval(true);
                            setShowClearItemsDialog(false);
                        }}>
                            Clear All
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    );
}

