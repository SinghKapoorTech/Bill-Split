import { useState, useEffect, useRef } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { HeroSection } from '@/components/layout/HeroSection';
import { ReceiptUploader } from '@/components/receipt/ReceiptUploader';
import { PeopleManager } from '@/components/people/PeopleManager';
import { BillItems } from '@/components/bill/BillItems';
import { BillSummary } from '@/components/bill/BillSummary';
import { SplitSummary } from '@/components/people/SplitSummary';

import { ShareLinkDialog } from '@/components/share/ShareLinkDialog';
import { TwoColumnLayout, ReceiptPreview } from '@/components/shared/TwoColumnLayout';
import { Stepper, Step, StepContent } from '@/components/ui/stepper';
import { StepFooter } from '@/components/shared/StepFooter';
import { useBillSplitter } from '@/hooks/useBillSplitter';
import { usePeopleManager } from '@/hooks/usePeopleManager';
import { useFileUpload } from '@/hooks/useFileUpload';
import { useReceiptAnalyzer } from '@/hooks/useReceiptAnalyzer';
import { useItemEditor } from '@/hooks/useItemEditor';
import { useIsMobile } from '@/hooks/use-mobile';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Receipt, Loader2, Sparkles, Pencil } from 'lucide-react';
import { useBillContext } from '@/contexts/BillSessionContext';
import { UI_TEXT } from '@/utils/uiConstants';
import { useSessionTimeout } from '@/hooks/useSessionTimeout';
import { Person, BillData, ItemAssignment } from '@/types';
import { areAllItemsAssigned } from '@/utils/calculations';
import { ensureUserInPeople } from '@/utils/billCalculations';
import { useAuth } from '@/contexts/AuthContext';
import { useUserProfile } from '@/hooks/useUserProfile';
import { billService } from '@/services/billService';

const STEPS: Step[] = [
  { id: 1, label: 'Bill Entry', description: 'Add items' },
  { id: 2, label: 'People', description: 'Add friends' },
  { id: 3, label: 'Assign', description: 'Split items' },
  { id: 4, label: 'Review', description: 'Finalize' },
];

export default function AIScanView() {
  const isMobile = useIsMobile();
  const isInitializing = useRef(true);
  const lastSavedData = useRef<string | null>(null);
  const location = useLocation();
  const navigate = useNavigate();
  const { billId } = useParams<{ billId: string }>();
  const { user } = useAuth();
  const { profile } = useUserProfile();

  // Step management
  const [currentStep, setCurrentStep] = useState(0);

  // Centralized state management
  const {
    activeSession,
    isLoadingSessions,
    isUploading,
    uploadReceiptImage,
    resumeSession,
    saveSession,
    removeReceiptImage,
  } = useBillContext();

  const [people, setPeople] = useState<Person[]>([]);
  const [billData, setBillData] = useState<BillData | null>(null);
  const [itemAssignments, setItemAssignments] = useState<ItemAssignment>({});
  const [title, setTitle] = useState<string>('');

  const [splitEvenly, setSplitEvenly] = useState<boolean>(false);

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

  const upload = useFileUpload();
  const analyzer = useReceiptAnalyzer(
    setBillData,
    setPeople,
    billData
  );

  const editor = useItemEditor(
    billData,
    setBillData,
    bill.removeItemAssignments
  );

  // Share link state
  const [showShareLinkDialog, setShowShareLinkDialog] = useState(false);
  const [isGeneratingShareCode, setIsGeneratingShareCode] = useState(false);

  // Load session data from Firebase into local state
  useEffect(() => {
    isInitializing.current = true;
    if (activeSession) {
      setBillData(activeSession.billData || null);
      setItemAssignments(activeSession.itemAssignments || {});
      // Ensure logged-in user is always in the people list
      setPeople(ensureUserInPeople(activeSession.people || [], user, profile));
      setSplitEvenly(activeSession.splitEvenly || false);
      setTitle(activeSession.title || '');

      // RESTORE STEP POSITION
      if (activeSession.currentStep !== undefined) {
        setCurrentStep(activeSession.currentStep);
      } else {
        // No saved step (old bill), default to 0
        setCurrentStep(0);
      }

      if (activeSession.receiptImageUrl) {
        upload.setImagePreview(activeSession.receiptImageUrl);
        upload.setSelectedFile(new File([], activeSession.receiptFileName || 'receipt.jpg'));
      } else {
        upload.handleRemoveImage();
      }
    } else {
      // If no session, reset to initial state
      setBillData(null);
      setItemAssignments({});
      // Ensure logged-in user is added even when clearing
      setPeople(ensureUserInPeople([], user, profile));
      setSplitEvenly(false);
      upload.handleRemoveImage();
      setCurrentStep(0);
    }
    // Allow saves after a short delay to let state updates settle
    const timer = setTimeout(() => (isInitializing.current = false), 200);
    return () => clearTimeout(timer);
  }, [activeSession]);

  // Effect to load bill when billId URL parameter changes
  useEffect(() => {
    if (billId && billId !== activeSession?.id) {
      console.log('Loading bill from URL param:', billId);
      resumeSession(billId);
    }
  }, [billId]);

  // Effect to handle resuming a session from navigation state
  useEffect(() => {
    const { resumeSessionId } = location.state || {};
    if (resumeSessionId) {
      resumeSession(resumeSessionId);
      // Clear location state to prevent re-triggering on refresh
      navigate('.', { replace: true, state: {} });
    }
  }, [location, resumeSession, navigate]);

  useSessionTimeout({
    onTimeout: () => {
      // Navigate to dashboard on timeout
      navigate('/dashboard');
    },
    timeoutMinutes: 20,
  });

  // Debounced auto-save for user edits with dirty checking
  useEffect(() => {
    // Don't auto-save during initialization
    if (isInitializing.current) return;

    const timeoutId = setTimeout(() => {
      // Create a snapshot of current data for dirty checking
      const currentData = JSON.stringify({
        billData,
        people,
        itemAssignments,
        splitEvenly,
        currentStep,
        title,
        receiptImageUrl: activeSession?.receiptImageUrl || null,
        receiptFileName: activeSession?.receiptFileName || null,
      });

      // Only save if data has actually changed
      if (currentData !== lastSavedData.current) {
        saveSession({
          billData,
          people,
          itemAssignments,
          splitEvenly,
          receiptImageUrl: activeSession?.receiptImageUrl || null,
          receiptFileName: activeSession?.receiptFileName || null,
          currentStep,
          title: title || undefined, // Only save if not empty
        }, billId || activeSession?.id);

        // Update last saved snapshot
        lastSavedData.current = currentData;
      }
    }, 3000); // Debounce by 3 seconds for better scalability

    return () => clearTimeout(timeoutId);
  }, [billData, people, itemAssignments, splitEvenly, currentStep, title]);

  const handleRemovePerson = (personId: string) => {
    peopleManager.removePerson(personId);
    bill.removePersonFromAssignments(personId);
  };

  const handleRemoveImage = async () => {
    // Clear local UI state immediately
    upload.handleRemoveImage();
    
    // Clear bill data since we're removing the source
    setBillData(null);
    
    // Reset to step 0 (Upload)
    setCurrentStep(0);

    // Remove image from Firebase Storage and update session in Firestore
    await removeReceiptImage();
  };

  const handleDone = () => {
    navigate('/dashboard');
  };

  const handleGenerateShareLink = async () => {
    if (!activeSession?.id || !user) return;

    setIsGeneratingShareCode(true);
    try {
      await billService.generateShareCode(activeSession.id, user.uid);
      setShowShareLinkDialog(true);
    } catch (error) {
      console.error('Error generating share code:', error);
    } finally {
      setIsGeneratingShareCode(false);
    }
  };

  const handleRegenerateShareLink = async () => {
    if (!activeSession?.id || !user) return;

    setIsGeneratingShareCode(true);
    try {
      // Force regenerate by clearing the existing code first
      await billService.updateBill(activeSession.id, {
        shareCode: undefined,
        shareCodeCreatedAt: undefined,
        shareCodeExpiresAt: undefined,
        shareCodeCreatedBy: undefined,
      });
      // Generate new code
      await billService.generateShareCode(activeSession.id, user.uid);
    } catch (error) {
      console.error('Error regenerating share code:', error);
    } finally {
      setIsGeneratingShareCode(false);
    }
  };

  const handleAnalyzeReceipt = async () => {
    if (!upload.imagePreview || !upload.selectedFile) {
      console.error("Cannot analyze: image preview or file is missing.");
      return;
    }

    // Fresh upload: analyze and upload in parallel
    const analysisPromise = analyzer.analyzeReceipt(upload.selectedFile, upload.imagePreview);
    const uploadPromise = uploadReceiptImage(upload.selectedFile);

    const [analyzedBillData, uploadResult] = await Promise.all([analysisPromise, uploadPromise]);
    console.log({analyzedBillData})

    // Set restaurant name as title if available and user hasn't set a custom title
    let newTitle: string = title || '';
    if (!title && analyzedBillData?.restaurantName) {
      newTitle = analyzedBillData.restaurantName;
      setTitle(newTitle);
    }

    // Save all state including new upload info
    await saveSession({
      billData: analyzedBillData,
      people,
      itemAssignments,
      splitEvenly,
      receiptImageUrl: uploadResult?.downloadURL,
      receiptFileName: uploadResult?.fileName,
      title: newTitle || undefined,
    }, billId || activeSession?.id);

    // Don't automatically move to next step - let user review and proceed manually
  };

  const handleImageSelected = async (fileOrBase64: File | string) => {
    if (typeof fileOrBase64 === 'string') {
      // From mobile camera (base64 string)
      upload.setImagePreview(fileOrBase64);
      // Convert base64 to file for upload
      const response = await fetch(fileOrBase64);
      const blob = await response.blob();
      const file = new File([blob], 'receipt.jpg', { type: blob.type });
      upload.setSelectedFile(file);
    } else {
      // From web file input (File object)
      upload.handleFileSelect(fileOrBase64);
    }
  };



  // Step navigation
  const handleNextStep = () => {
    if (currentStep < STEPS.length - 1) {
      setCurrentStep(currentStep + 1);
    }
  };

  const handlePrevStep = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  // Validation for step progression
  const canProceedFromStep = (step: number): boolean => {
    switch (step) {
      case 0: // Bill Entry step (merged Upload + Items)
        return billData && billData.items.length > 0; // Need at least one item
      case 1: // People step
        return people.length > 0; // Need at least one person
      case 2: // Assign step
        return areAllItemsAssigned(billData, itemAssignments); // All items must be assigned
      case 3: // Review step
        return true; // Final step
      default:
        return false;
    }
  };

  // Determine which steps can be navigated to
  const canNavigateToStep = (stepIndex: number): boolean => {
    // Always allow navigating to current step or previous steps
    if (stepIndex <= currentStep) {
      return true;
    }
    
    // For future steps, check if all previous steps are completed
    for (let i = 0; i < stepIndex; i++) {
      if (!canProceedFromStep(i)) {
        return false;
      }
    }
    return true;
  };

  if (isLoadingSessions) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="w-12 h-12 animate-spin text-primary" />
      </div>
    );
  }

  // Format date for display
  const formatDate = (timestamp: any) => {
    if (!timestamp) return new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  return (
    <>
      <HeroSection
        hasBillData={!!billData}
        onShare={handleGenerateShareLink}
      />

      {/* Stepper */}
      <div className="mb-6 md:mb-8">
        <Stepper
          steps={STEPS}
          currentStep={currentStep}
          orientation={isMobile ? 'horizontal' : 'horizontal'}
          onStepClick={setCurrentStep}
          canNavigateToStep={canNavigateToStep}
        />
      </div>

      {/* Persistent Title - Top of unified card */}
      <Card className="max-w-3xl mx-auto rounded-b-none border-b-0 mb-0">
        <div className="flex items-center gap-2 p-4 pb-3">
          <Input
            id="bill-title"
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={formatDate(activeSession?.createdAt)}
            className="text-lg font-semibold border-0 focus-visible:ring-0 px-0 h-auto flex-1"
          />
          <Pencil className="w-4 h-4 text-muted-foreground flex-shrink-0" />
        </div>
      </Card>

      {/* Step Content */}
      <StepContent stepKey={currentStep}>
        {/* Step 1: Bill Entry (Upload + Items) */}
        {currentStep === 0 && (
          <div>
            <TwoColumnLayout
              imageUrl={activeSession?.receiptImageUrl || upload.imagePreview}
              leftColumn={
                <Card className="p-4 md:p-6 sticky top-4">
                  <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                    <Sparkles className="w-5 h-5 text-primary" />
                    Receipt Upload
                  </h3>
                  <p className="text-sm text-muted-foreground mb-4">
                    Upload a photo of your receipt and let AI extract items automatically
                  </p>
                  <ReceiptUploader
                    selectedFile={upload.selectedFile}
                    imagePreview={upload.imagePreview}
                    isDragging={upload.isDragging}
                    isUploading={isUploading}
                    isAnalyzing={analyzer.isAnalyzing}
                    isMobile={isMobile}
                    onFileInput={(e) => e.target.files && handleImageSelected(e.target.files[0])}
                    onDragOver={upload.handleDragOver}
                    onDragLeave={upload.handleDragLeave}
                    onDrop={(e) => {
                      upload.handleDrop(e);
                      const file = e.dataTransfer.files?.[0];
                      if (file) handleImageSelected(file);
                    }}
                    onRemove={handleRemoveImage}
                    onAnalyze={handleAnalyzeReceipt}
                    onImageSelected={handleImageSelected}
                    fileInputRef={upload.fileInputRef}
                  />
                  {upload.imagePreview && (
                    <Button
                      onClick={handleAnalyzeReceipt}
                      disabled={analyzer.isAnalyzing || isUploading}
                      className="gap-2 w-full mt-4"
                    >
                      {analyzer.isAnalyzing ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Analyzing...
                        </>
                      ) : (
                        <>
                          <Sparkles className="w-4 h-4" />
                          Analyze Receipt
                        </>
                      )}
                    </Button>
                  )}
                </Card>
              }
              rightColumn={
                <Card className="p-4 md:p-6 max-w-3xl mx-auto rounded-t-none">
                  <div className="flex items-center gap-2 mb-4">
                    <Receipt className="w-5 h-5 text-primary" />
                    <h3 className="text-xl font-semibold">{UI_TEXT.BILL_ITEMS}</h3>
                  </div>
                  <p className="text-sm text-muted-foreground mb-4">
                    Add items manually or upload a receipt to extract them automatically
                  </p>

                  <BillItems
                    billData={billData || { items: [], subtotal: 0, tax: 0, tip: 0, total: 0 }}
                    people={[]}
                    itemAssignments={{}}
                    editingItemId={editor.editingItemId}
                    editingItemName={editor.editingItemName}
                    editingItemPrice={editor.editingItemPrice}
                    onAssign={() => {}}
                    onEdit={editor.editItem}
                    onSave={editor.saveEdit}
                    onCancel={editor.cancelEdit}
                    onDelete={editor.deleteItem}
                    setEditingName={editor.setEditingItemName}
                    setEditingPrice={editor.setEditingItemPrice}
                    isAdding={editor.isAdding}
                    newItemName={editor.newItemName}
                    newItemPrice={editor.newItemPrice}
                    setNewItemName={editor.setNewItemName}
                    setNewItemPrice={editor.setNewItemPrice}
                    onStartAdding={editor.startAdding}
                    onAddItem={editor.addItem}
                    onCancelAdding={editor.cancelAdding}
                    splitEvenly={false}
                    onToggleSplitEvenly={() => {}}
                  />

                  <BillSummary
                    billData={billData || { items: [], subtotal: 0, tax: 0, tip: 0, total: 0 }}
                    onUpdate={(updates) => setBillData({ ...billData, ...updates })}
                  />
                </Card>
              }
            />

            <StepFooter
              currentStep={currentStep}
              totalSteps={STEPS.length}
              onNext={handleNextStep}
              nextDisabled={!canProceedFromStep(0)}
            />
          </div>
        )}


        {/* Step 2: Add People */}
        {currentStep === 1 && (
          <div>
            <TwoColumnLayout
              imageUrl={activeSession?.receiptImageUrl || upload.imagePreview}
              leftColumn={
                activeSession?.receiptImageUrl || upload.imagePreview ? (
                  <ReceiptPreview imageUrl={activeSession?.receiptImageUrl || upload.imagePreview} />
                ) : null
              }
              rightColumn={
                <PeopleManager
                  people={people}
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
                  setPeople={setPeople}
                />
              }
            />

            <StepFooter
              currentStep={currentStep}
              totalSteps={STEPS.length}
              onBack={handlePrevStep}
              onNext={handleNextStep}
              nextDisabled={!canProceedFromStep(1)}
            />
          </div>
        )}

        {/* Step 3: Assign Items */}
        {currentStep === 2 && billData && (
          <div>
            <TwoColumnLayout
              imageUrl={activeSession?.receiptImageUrl || upload.imagePreview}
              leftColumn={
                activeSession?.receiptImageUrl || upload.imagePreview ? (
                  <ReceiptPreview imageUrl={activeSession?.receiptImageUrl || upload.imagePreview} />
                ) : null
              }
              rightColumn={
                <Card className="p-4 md:p-6 max-w-3xl mx-auto rounded-t-none">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
                    <div className="flex items-center gap-2">
                      <Receipt className="w-5 h-5 text-primary" />
                      <h3 className="text-xl font-semibold">{UI_TEXT.BILL_ITEMS}</h3>
                    </div>


                  </div>

                  <BillItems
                    billData={billData}
                    people={people}
                    itemAssignments={itemAssignments}
                    editingItemId={editor.editingItemId}
                    editingItemName={editor.editingItemName}
                    editingItemPrice={editor.editingItemPrice}
                    onAssign={bill.handleItemAssignment}
                    onEdit={editor.editItem}
                    onSave={editor.saveEdit}
                    onCancel={editor.cancelEdit}
                    onDelete={editor.deleteItem}
                    setEditingName={editor.setEditingItemName}
                    setEditingPrice={editor.setEditingItemPrice}
                    isAdding={editor.isAdding}
                    newItemName={editor.newItemName}
                    newItemPrice={editor.newItemPrice}
                    setNewItemName={editor.setNewItemName}
                    setNewItemPrice={editor.setNewItemPrice}
                    onStartAdding={editor.startAdding}
                    onAddItem={editor.addItem}
                    onCancelAdding={editor.cancelAdding}
                    splitEvenly={splitEvenly}
                    onToggleSplitEvenly={bill.toggleSplitEvenly}
                  />

                  {people.length === 0 && !isMobile && billData && (
                    <p className="text-sm text-muted-foreground text-center py-4 mt-4">
                      {UI_TEXT.ADD_PEOPLE_TO_ASSIGN}
                    </p>
                  )}

                  <BillSummary
                    billData={billData}
                    onUpdate={(updates) => setBillData({ ...billData, ...updates })}
                  />
                </Card>
              }
            />

            <StepFooter
              currentStep={currentStep}
              totalSteps={STEPS.length}
              onBack={handlePrevStep}
              onNext={handleNextStep}
              nextDisabled={!canProceedFromStep(2)}
            />
          </div>
        )}

        {/* Step 4: Review & Share */}
        {currentStep === 3 && billData && (
          <div>
            <Card className="p-4 md:p-6 max-w-3xl mx-auto rounded-t-none">
              <SplitSummary
                personTotals={bill.personTotals}
                allItemsAssigned={bill.allItemsAssigned}
                people={people}
                billData={billData}
                itemAssignments={itemAssignments}
              />
            </Card>

            <StepFooter
              currentStep={currentStep}
              totalSteps={STEPS.length}
              onBack={handlePrevStep}
              onComplete={handleDone}
              completeLabel="Done"
            />
          </div>
        )}
      </StepContent>

      {/* Share Link Dialog */}
      {showShareLinkDialog && activeSession?.id && (
        <ShareLinkDialog
          isOpen={showShareLinkDialog}
          onClose={() => setShowShareLinkDialog(false)}
          billId={activeSession.id}
          shareCode={activeSession.shareCode || ''}
          expiresAt={activeSession.shareCodeExpiresAt}
          onRegenerate={handleRegenerateShareLink}
          isRegenerating={isGeneratingShareCode}
        />
      )}
    </>
  );
}