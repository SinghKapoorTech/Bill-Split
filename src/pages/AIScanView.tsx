import { useState, useEffect, useRef } from 'react';
import { HeroSection } from '@/components/layout/HeroSection';
import { ReceiptUploader } from '@/components/receipt/ReceiptUploader';
import { PeopleManager } from '@/components/people/PeopleManager';
import { BillItems } from '@/components/bill/BillItems';
import { BillSummary } from '@/components/bill/BillSummary';
import { SplitSummary } from '@/components/people/SplitSummary';
import { AssignmentModeToggle } from '@/components/bill/AssignmentModeToggle';
import { FeatureCards } from '@/components/shared/FeatureCards';
import { ShareSessionModal } from '@/components/share/ShareSessionModal';
import { TwoColumnLayout, ReceiptPreview } from '@/components/shared/TwoColumnLayout';
import { Stepper, Step, StepContent } from '@/components/ui/stepper';
import { StepFooter } from '@/components/shared/StepFooter';
import { useBillSplitter } from '@/hooks/useBillSplitter';
import { usePeopleManager } from '@/hooks/usePeopleManager';
import { useFileUpload } from '@/hooks/useFileUpload';
import { useReceiptAnalyzer } from '@/hooks/useReceiptAnalyzer';
import { useItemEditor } from '@/hooks/useItemEditor';
import { useIsMobile } from '@/hooks/use-mobile';
import { useShareSession } from '@/hooks/useShareSession';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Receipt, Users, Loader2, Sparkles } from 'lucide-react';
import { useBillSession } from '@/contexts/BillSessionContext';
import { UI_TEXT } from '@/utils/uiConstants';
import { useSessionTimeout } from '@/hooks/useSessionTimeout';
import { Person, BillData, ItemAssignment, AssignmentMode } from '@/types';
import { useLocation, useNavigate } from 'react-router-dom';
import { areAllItemsAssigned } from '@/utils/calculations';
import { ensureUserInPeople } from '@/utils/billCalculations';
import { useAuth } from '@/contexts/AuthContext';
import { useUserProfile } from '@/hooks/useUserProfile';

const STEPS: Step[] = [
  { id: 1, label: 'Upload', description: 'Scan receipt' },
  { id: 2, label: 'Items', description: 'Edit bill' },
  { id: 3, label: 'People', description: 'Add friends' },
  { id: 4, label: 'Assign', description: 'Split items' },
  { id: 5, label: 'Review', description: 'Finalize' },
];

export default function AIScanView() {
  const isMobile = useIsMobile();
  const isInitializing = useRef(true);
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { profile } = useUserProfile();

  // Step management
  const [currentStep, setCurrentStep] = useState(0);

  // Centralized state management
  const {
    activeSession,
    isLoadingSessions,
    isUploading,
    archiveAndStartNewSession,
    clearSession,
    uploadReceiptImage,
    resumeSession,
    saveSession,
    removeReceiptImage,
  } = useBillSession();

  const [people, setPeople] = useState<Person[]>([]);
  const [billData, setBillData] = useState<BillData | null>(null);
  const [itemAssignments, setItemAssignments] = useState<ItemAssignment>({});
  const [assignmentMode, setAssignmentMode] = useState<AssignmentMode>('checkboxes');
  const [customTip, setCustomTip] = useState<string>('');
  const [customTax, setCustomTax] = useState<string>('');
  const [splitEvenly, setSplitEvenly] = useState<boolean>(false);

  const peopleManager = usePeopleManager(people, setPeople);
  const bill = useBillSplitter({
    people,
    billData,
    setBillData,
    itemAssignments,
    setItemAssignments,
    assignmentMode,
    setAssignmentMode,
    customTip,
    setCustomTip,
    customTax,
    setCustomTax,
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
    customTip,
    bill.removeItemAssignments
  );

  const { sharePrivateSession, isSharing } = useShareSession();
  const [showShareModal, setShowShareModal] = useState(false);
  const [sharedSessionId, setSharedSessionId] = useState<string | null>(null);
  const [shareCode, setShareCode] = useState<string | null>(null);

  // Load session data from Firebase into local state
  useEffect(() => {
    isInitializing.current = true;
    if (activeSession) {
      setBillData(activeSession.billData || null);
      setItemAssignments(activeSession.itemAssignments || {});
      // Ensure logged-in user is always in the people list
      setPeople(ensureUserInPeople(activeSession.people || [], user, profile));
      setCustomTip(activeSession.customTip || '');
      setCustomTax(activeSession.customTax || '');
      setAssignmentMode(activeSession.assignmentMode || 'checkboxes');
      setSplitEvenly(activeSession.splitEvenly || false);
      if (activeSession.receiptImageUrl) {
        upload.setImagePreview(activeSession.receiptImageUrl);
        upload.setSelectedFile(new File([], activeSession.receiptFileName || 'receipt.jpg'));
      } else {
        upload.handleRemoveImage();
      }

      // Determine which step to show based on session state
      if (activeSession.billData && activeSession.people.length > 0) {
        setCurrentStep(3); // Go to Assign Items step
      } else if (activeSession.billData) {
        setCurrentStep(1); // Go to Items step
      } else if (activeSession.receiptImageUrl) {
        setCurrentStep(0); // Stay on Upload step (image uploaded but not analyzed)
      }
    } else {
      // If no session, reset to initial state
      setBillData(null);
      setItemAssignments({});
      // Ensure logged-in user is added even when clearing
      setPeople(ensureUserInPeople([], user, profile));
      setCustomTip('');
      setCustomTax('');
      setAssignmentMode('checkboxes');
      setSplitEvenly(false);
      upload.handleRemoveImage();
      setCurrentStep(0);
    }
    // Allow saves after a short delay to let state updates settle
    const timer = setTimeout(() => (isInitializing.current = false), 200);
    return () => clearTimeout(timer);
  }, [activeSession]);

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
      // Clear session on timeout without saving
      clearSession();
    },
    timeoutMinutes: 20,
  });

  // Debounced auto-save for user edits
  useEffect(() => {
    // Don't auto-save during initialization
    if (isInitializing.current) return;

    const timeoutId = setTimeout(() => {
      saveSession({
        billData,
        people,
        itemAssignments,
        customTip,
        customTax,
        assignmentMode,
        splitEvenly,
        receiptImageUrl: activeSession?.receiptImageUrl || null,
        receiptFileName: activeSession?.receiptFileName || null,
      });
    }, 1500); // Debounce by 1.5 seconds

    return () => clearTimeout(timeoutId);
  }, [billData, people, itemAssignments, customTip, customTax, assignmentMode, splitEvenly, activeSession?.receiptImageUrl, activeSession?.receiptFileName, saveSession]);

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

  const handleStartOver = async () => {
    await clearSession();
    setCurrentStep(0);
  };

  const handleSave = async () => {
    await archiveAndStartNewSession();
  };

  const handleShare = async () => {
    if (!activeSession) return;

    // Share the session (receipt URL will be reused from private session)
    const result = await sharePrivateSession(activeSession);

    if (result) {
      setSharedSessionId(result.sessionId);
      setShareCode(result.shareCode);
      setShowShareModal(true);

      // Navigate to the collaborative session
      navigate(`/session/${result.sessionId}`);
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

    // Save all state including new upload info
    await saveSession({
      billData: analyzedBillData,
      people,
      itemAssignments,
      customTip,
      customTax,
      assignmentMode,
      splitEvenly,
      receiptImageUrl: uploadResult?.downloadURL,
      receiptFileName: uploadResult?.fileName,
    });

    // Move to next step after analysis
    if (analyzedBillData) {
      setCurrentStep(1);
    }
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

  const handleManualEntry = () => {
    // Initialize empty bill data for manual entry
    setBillData({
      items: [],
      subtotal: 0,
      tax: 0,
      tip: 0,
      total: 0,
    });
    setCurrentStep(1); // Go to Items step
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
      case 0: // Upload step
        return !!billData; // Need bill data to proceed
      case 1: // Items step
        return billData && billData.items.length > 0; // Need at least one item
      case 2: // People step
        return people.length > 0; // Need at least one person
      case 3: // Assign step
        return areAllItemsAssigned(billData, itemAssignments); // All items must be assigned
      case 4: // Review step
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

  return (
    <>
      <HeroSection
        hasBillData={!!billData}
        onLoadMock={analyzer.loadMockData}
        onStartOver={handleStartOver}
        onSave={handleSave}
        onShare={handleShare}
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

      {/* Step Content */}
      <StepContent stepKey={currentStep}>
        {/* Step 1: Upload & Scan */}
        {currentStep === 0 && (
          <div className="space-y-6">
            {/* Two-column layout on desktop */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Left: AI-Powered Receipt Scan */}
              <Card className="p-6">
                <h3 className="text-xl font-semibold mb-4 flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-primary" />
                  AI-Powered Receipt Scan
                </h3>
                <p className="text-sm text-muted-foreground mb-4">
                  Upload a photo of your receipt and let AI extract all the items automatically
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
                {upload.imagePreview && !billData && (
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

              {/* Right: Manual Entry */}
              <Card className="p-6 flex flex-col">
                <h3 className="text-xl font-semibold mb-4 flex items-center gap-2">
                  <Receipt className="w-5 h-5 text-primary" />
                  Manual Entry
                </h3>
                <p className="text-sm text-muted-foreground mb-4">
                  Don't have a receipt photo? Enter your bill items manually
                </p>
                <div className="flex-1 flex items-center justify-center py-8">
                  <div className="text-center space-y-4">
                    <div className="w-16 h-16 mx-auto rounded-full bg-primary/10 flex items-center justify-center">
                      <Receipt className="w-8 h-8 text-primary" />
                    </div>
                    <div>
                      <p className="font-medium mb-2">Enter bill details yourself</p>
                      <p className="text-sm text-muted-foreground">
                        Add items, prices, tax, and tip manually
                      </p>
                    </div>
                    <Button
                      onClick={handleManualEntry}
                      className="gap-2"
                      size="lg"
                    >
                      <Receipt className="w-4 h-4" />
                      Start Manual Entry
                    </Button>
                  </div>
                </div>
              </Card>
            </div>

            {!billData && <FeatureCards />}

            <StepFooter
              currentStep={currentStep}
              totalSteps={STEPS.length}
              onNext={handleNextStep}
              nextDisabled={!canProceedFromStep(0)}
            />
          </div>
        )}

        {/* Step 2: Bill Items */}
        {currentStep === 1 && billData && (
          <div className="space-y-6">
            <TwoColumnLayout
              imageUrl={activeSession?.receiptImageUrl || upload.imagePreview}
              leftColumn={
                <ReceiptPreview imageUrl={activeSession?.receiptImageUrl || upload.imagePreview} />
              }
              rightColumn={
                <Card className="p-4 md:p-6">
                  <div className="flex items-center gap-2 mb-4">
                    <Receipt className="w-5 h-5 text-primary" />
                    <h3 className="text-xl font-semibold">{UI_TEXT.BILL_ITEMS}</h3>
                  </div>

                  <BillItems
                    billData={billData}
                    people={[]}
                    itemAssignments={{}}
                    assignmentMode="checkboxes"
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
                    billData={billData}
                    customTip={customTip}
                    effectiveTip={bill.effectiveTip}
                    customTax={customTax}
                    effectiveTax={bill.effectiveTax}
                    onTipChange={setCustomTip}
                    onTaxChange={setCustomTax}
                  />
                </Card>
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

        {/* Step 3: Add People */}
        {currentStep === 2 && (
          <div className="space-y-6">
            <div className="flex justify-center">
              <div className="w-full max-w-3xl">
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
              </div>
            </div>

            <StepFooter
              currentStep={currentStep}
              totalSteps={STEPS.length}
              onBack={handlePrevStep}
              onNext={handleNextStep}
              nextDisabled={!canProceedFromStep(2)}
            />
          </div>
        )}

        {/* Step 4: Assign Items */}
        {currentStep === 3 && billData && (
          <div className="space-y-6">
            <TwoColumnLayout
              imageUrl={activeSession?.receiptImageUrl || upload.imagePreview}
              leftColumn={
                <ReceiptPreview imageUrl={activeSession?.receiptImageUrl || upload.imagePreview} />
              }
              rightColumn={
                <Card className="p-4 md:p-6">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
                    <div className="flex items-center gap-2">
                      <Receipt className="w-5 h-5 text-primary" />
                      <h3 className="text-xl font-semibold">{UI_TEXT.BILL_ITEMS}</h3>
                    </div>

                    {people.length > 0 && !isMobile && (
                      <AssignmentModeToggle
                        mode={assignmentMode}
                        onModeChange={setAssignmentMode}
                      />
                    )}
                  </div>

                  <BillItems
                    billData={billData}
                    people={people}
                    itemAssignments={itemAssignments}
                    assignmentMode={assignmentMode}
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
                    customTip={customTip}
                    effectiveTip={bill.effectiveTip}
                    customTax={customTax}
                    effectiveTax={bill.effectiveTax}
                    onTipChange={setCustomTip}
                    onTaxChange={setCustomTax}
                  />
                </Card>
              }
            />

            <StepFooter
              currentStep={currentStep}
              totalSteps={STEPS.length}
              onBack={handlePrevStep}
              onNext={handleNextStep}
              nextDisabled={!canProceedFromStep(3)}
            />
          </div>
        )}

        {/* Step 5: Review & Share */}
        {currentStep === 4 && billData && (
          <div className="space-y-6">
            <SplitSummary
              personTotals={bill.personTotals}
              allItemsAssigned={bill.allItemsAssigned}
              people={people}
              billData={billData}
              itemAssignments={itemAssignments}
            />

            <StepFooter
              currentStep={currentStep}
              totalSteps={STEPS.length}
              onBack={handlePrevStep}
              completeLabel="Done"
            />
          </div>
        )}
      </StepContent>

      {/* Share Modal */}
      {sharedSessionId && shareCode && (
        <ShareSessionModal
          isOpen={showShareModal}
          onClose={() => setShowShareModal(false)}
          sessionId={sharedSessionId}
          shareCode={shareCode}
        />
      )}
    </>
  );
}