import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Stepper, StepContent } from '@/components/ui/stepper';
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
import { deleteField } from 'firebase/firestore';
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

    // Event handlers
    const handleRemovePerson = (personId: string) => {
        peopleManager.removePerson(personId);
        bill.removePersonFromAssignments(personId);
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

        const analysisPromise = analyzer.analyzeReceipt(upload.selectedFile, upload.imagePreview);
        const uploadPromise = uploadReceiptImage(upload.selectedFile);

        const [analyzedBillData, uploadResult] = await Promise.all([analysisPromise, uploadPromise]);

        if (!analyzedBillData) {
            console.error('Receipt analysis failed, not saving');
            return;
        }

        // Update title from restaurant name if no title exists
        let newTitle: string = title || '';
        if (!title && analyzedBillData?.restaurantName) {
            newTitle = analyzedBillData.restaurantName;
            onTitleChange(newTitle); // Notify parent of title change
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

        const titleToSave = analyzedBillData?.restaurantName && !title ? analyzedBillData.restaurantName : title;
        if (titleToSave) {
            savePayload.title = titleToSave;
        }

        await saveSession(savePayload, billId || activeSession?.id);
    };

    const handleImageSelected = async (fileOrBase64: File | string) => {
        if (typeof fileOrBase64 === 'string') {
            upload.setImagePreview(fileOrBase64);
            const response = await fetch(fileOrBase64);
            const blob = await response.blob();
            const file = new File([blob], 'receipt.jpg', { type: blob.type });
            upload.setSelectedFile(file);
        } else {
            upload.handleFileSelect(fileOrBase64);
        }
    };

    const handleDone = () => {
        navigate('/dashboard');
    };

    return (
        <>
            {/* Stepper */}
            <div className="wizard-stepper">
                <Stepper
                    steps={STEPS}
                    currentStep={wizard.currentStep}
                    orientation={isMobile ? 'horizontal' : 'horizontal'}
                    onStepClick={wizard.setCurrentStep}
                    canNavigateToStep={wizard.canNavigateToStep}
                />
            </div>

            {/* Mobile Navigation (below stepper) */}
            {isMobile && (
                <WizardNavigation
                    currentStep={wizard.currentStep}
                    totalSteps={STEPS.length}
                    onBack={wizard.handlePrevStep}
                    onNext={wizard.handleNextStep}
                    onComplete={handleDone}
                    nextDisabled={!wizard.canProceedFromStep(wizard.currentStep)}
                    hasBillData={hasBillData}
                    onShare={onShare}
                    isMobile={isMobile}
                />
            )}

            {/* Step Content */}
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
                        useNameAsVenmoId={peopleManager.useNameAsVenmoId}
                        onNameChange={peopleManager.setNewPersonName}
                        onVenmoIdChange={peopleManager.setNewPersonVenmoId}
                        onUseNameAsVenmoIdChange={peopleManager.setUseNameAsVenmoId}
                        onAdd={peopleManager.addPerson}
                        onAddFromFriend={peopleManager.addFromFriend}
                        onRemove={handleRemovePerson}
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
                        isMobile={isMobile}
                        upload={upload}
                    />
                )}

                {wizard.currentStep === 2 && (
                    <AssignmentStep
                        billData={billData}
                        setBillData={setBillData}
                        people={people}
                        itemAssignments={itemAssignments}
                        splitEvenly={splitEvenly}
                        onAssign={bill.handleItemAssignment}
                        onToggleSplitEvenly={bill.toggleSplitEvenly}
                        removePersonFromAssignments={bill.removePersonFromAssignments}
                        removeItemAssignments={bill.removeItemAssignments}
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
