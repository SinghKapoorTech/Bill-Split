import { useState, useEffect, useRef, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { arrayUnion } from 'firebase/firestore'; 
import { ReceiptUploader } from '@/components/receipt/ReceiptUploader';
import { PeopleManager } from '@/components/people/PeopleManager';
import { BillItems } from '@/components/bill/BillItems';
import { BillSummary } from '@/components/bill/BillSummary';
import { SplitSummary } from '@/components/people/SplitSummary';
import { GuestClaimView } from '@/components/guest/GuestClaimView';

import { ShareButton } from '@/components/share/ShareButton';
import { ShareSessionModal } from '@/components/share/ShareSessionModal';
import { CollaborativeBadge } from '@/components/share/CollaborativeBadge';
import { useBillSplitter } from '@/hooks/useBillSplitter';
import { usePeopleManager } from '@/hooks/usePeopleManager';
import { useFileUpload } from '@/hooks/useFileUpload';
import { useReceiptAnalyzer } from '@/hooks/useReceiptAnalyzer';
import { useItemEditor } from '@/hooks/useItemEditor';
import { useIsMobile } from '@/hooks/use-mobile';
import { useBillSession } from '@/hooks/useBillSession';
import { Card } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Receipt, Upload, Edit, Loader2, AlertCircle } from 'lucide-react';
import { UI_TEXT } from '@/utils/uiConstants';
import { Person, BillData, ItemAssignment } from '@/types';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { ensureUserInPeople } from '@/utils/billCalculations';
import { useAuth } from '@/contexts/AuthContext';
import { useUserProfile } from '@/hooks/useUserProfile';

export default function CollaborativeSessionView() {
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const { sessionId } = useParams<{ sessionId: string }>();
  const [activeTab, setActiveTab] = useState('ai-scan');
  const [showShareModal, setShowShareModal] = useState(false);
  const isInitializing = useRef(true);
  const { user } = useAuth();
  const { profile } = useUserProfile();

  // Collaborative session hook with real-time updates
  const { session, isLoading, error, updateSession, endSession, toggleAssignment } = useBillSession(sessionId || null);

  // Local state synced with collaborative session
  const [people, setPeople] = useState<Person[]>([]);
  const [billData, setBillData] = useState<BillData | null>(null);
  const [itemAssignments, setItemAssignments] = useState<ItemAssignment>({});

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
  const analyzer = useReceiptAnalyzer(setBillData, setPeople, billData);
  const editor = useItemEditor(billData, setBillData, bill.removeItemAssignments);

  // Sync local state with collaborative session
  useEffect(() => {
    isInitializing.current = true;
    if (session) {
      setBillData(session.billData || null);
      setItemAssignments(session.itemAssignments || {});
      // Ensure logged-in user is always in the people list
      setPeople(ensureUserInPeople(session.people || [], user, profile));
      setSplitEvenly(session.splitEvenly || false);
      if (session.receiptImageUrl) {
        upload.setImagePreview(session.receiptImageUrl);
        upload.setSelectedFile(new File([], session.receiptFileName || 'receipt.jpg'));
      }
    }
    const timer = setTimeout(() => (isInitializing.current = false), 200);
    return () => clearTimeout(timer);
  }, [session]);

  // Debounced auto-save to Firestore
  // NOTE: We excluded people and itemAssignments from auto-save to prevent race conditions.
  // Those are now updated atomically via events.
  useEffect(() => {
    if (isInitializing.current || !session) return;

    const timeoutId = setTimeout(() => {
      updateSession({
        billData,
        // people, // Handled atomically/immediately
        // itemAssignments, // Handled atomically
        splitEvenly,
      });
    }, 1500);

    return () => clearTimeout(timeoutId);
  }, [billData, splitEvenly, session, updateSession]);

  // Determine if current user is the owner (must be before early returns)
  const isOwner = useMemo(() => {
    if (!user || !session) return false;
    return session.ownerId === user.uid;
  }, [user, session]);

  // Handlers for GuestClaimView (defined before early returns)
  const handleAddSelfToPeople = (newPerson: Person) => {
    const updatedPeople = [...people, newPerson];
    setPeople(updatedPeople);
    updateSession({ people: arrayUnion(newPerson) as unknown as Person[] });
  };

  const handleClaimItem = (itemId: string, personId: string, claimed: boolean) => {
    // 1. Optimistic update (for UI responsiveness)
    bill.handleItemAssignment(itemId, personId, claimed);
    
    // 2. Atomic update (for real-time sync)
    toggleAssignment(itemId, personId, claimed);
  };

  const handleRemovePerson = (personId: string) => {
    // 1. Optimistic update
    peopleManager.removePerson(personId);
    bill.removePersonFromAssignments(personId);
    
    // 2. Atomic update via service
    const updatedPeople = people.filter(p => p.id !== personId);
    updateSession({ people: updatedPeople });
  };

  const handleAnalyzeReceipt = async () => {
    if (!upload.imagePreview || !upload.selectedFile) {
      console.error("Cannot analyze: image preview or file is missing.");
      return;
    }

    const analyzedBillData = await analyzer.analyzeReceipt(upload.selectedFile, upload.imagePreview);

    // Upload receipt and update session
    // Note: We'll handle image upload separately in production
    if (analyzedBillData) {
      updateSession({
        billData: analyzedBillData,
        receiptImageUrl: upload.imagePreview,
        receiptFileName: upload.selectedFile.name,
      });
    }
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

  const handleEndSession = async () => {
    await endSession();
    navigate('/dashboard');
  };

  const handleUpdatePerson = async (personId: string, updates: Partial<Person>) => {
    // 1. Optimistic update
    const updatedPeople = people.map(p => 
      p.id === personId ? { ...p, ...updates } : p
    );
    setPeople(updatedPeople);
    
    // 2. Atomic update via service
    if (session) {
      // We need to import billService to use its static method
      // But since we are using useBillSession, we might not have direct access to the service method 
      // if it's not exposed by the hook. 
      // Let's check imports. billService is imported in the file? No.
      // We should probably add the method to useBillSession or import billService directly.
      // Importing billService directly is easier for now as per plan.
      const { billService } = await import('@/services/billService');
      await billService.updatePersonDetails(session.id, personId, updates);
    }
  };

  if (isLoading) {
    return (
      <div className="flex h-[50vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error || !session) {
    return (
      <div className="container mx-auto px-4 py-8">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            {error || "Session not found or has been deleted."}
          </AlertDescription>
        </Alert>
        <div className="mt-4 text-center">
          <Button onClick={() => navigate('/')} variant="outline">
            Return Home
          </Button>
        </div>
      </div>
    );
  }

  // Guest view - simplified claim interface
  if (!isOwner && session) {
    return (
      <div className="container mx-auto px-4 py-6 max-w-2xl">
        <div className="mb-6 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-bold">
              {session.billData?.restaurantName || 'Split Bill'}
            </h2>
            <CollaborativeBadge memberCount={session.members.length} />
          </div>
          <Alert>
            <AlertDescription>
              Claim the items you're paying for. Your selections sync in real-time.
            </AlertDescription>
          </Alert>
        </div>

        <GuestClaimView
          session={session}
          onAddSelfToPeople={handleAddSelfToPeople}
          onClaimItem={handleClaimItem}
          onUpdatePerson={handleUpdatePerson}
        />
      </div>
    );
  }

  return (
    <>
      {/* Header with Collaborative Badge and Share Button */}
      <div className="mb-6 space-y-4">
        <div className="text-center space-y-3">
          <h2 className="text-3xl md:text-5xl font-bold bg-gradient-to-r from-primary via-primary-glow to-accent bg-clip-text text-transparent">
            {UI_TEXT.HERO_TITLE}
          </h2>
          <p className="text-muted-foreground max-w-2xl mx-auto">
            {UI_TEXT.HERO_SUBTITLE}
          </p>
        </div>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <CollaborativeBadge memberCount={session.members.length} />
          <ShareButton onClick={() => setShowShareModal(true)} />
        </div>

        {/* Show real-time collaboration notice */}
        <Alert>
          <AlertDescription className="text-center">
            This is a collaborative session. Changes are synced in real-time with all participants.
          </AlertDescription>
        </Alert>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="ai-scan" className="gap-2">
            <Upload className="w-4 h-4" />
            AI Scan
          </TabsTrigger>
          <TabsTrigger value="manual" className="gap-2">
            <Edit className="w-4 h-4" />
            Manual Entry
          </TabsTrigger>
        </TabsList>

        <TabsContent value="ai-scan" className="space-y-6">
          <ReceiptUploader
            selectedFile={upload.selectedFile}
            imagePreview={upload.imagePreview}
            isDragging={upload.isDragging}
            isUploading={false}
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
            onRemove={upload.handleRemoveImage}
            onAnalyze={handleAnalyzeReceipt}
            onImageSelected={handleImageSelected}
            fileInputRef={upload.fileInputRef}
          />

          {billData && (
            <div className="space-y-6">
              <PeopleManager
                people={people}
                newPersonName={peopleManager.newPersonName}
                newPersonVenmoId={peopleManager.newPersonVenmoId}
                useNameAsVenmoId={peopleManager.useNameAsVenmoId}
                onNameChange={peopleManager.setNewPersonName}
                onVenmoIdChange={peopleManager.setNewPersonVenmoId}
                onUseNameAsVenmoIdChange={peopleManager.setUseNameAsVenmoId}
                onAdd={async () => {
                  const newPerson = await peopleManager.addPerson();
                  if (newPerson) {
                    // Atomic add
                    updateSession({ people: arrayUnion(newPerson) as unknown as Person[] });
                  }
                }}
                onAddFromFriend={(f) => {
                  const newPerson = peopleManager.addFromFriend(f);
                  if (newPerson) {
                     updateSession({ people: arrayUnion(newPerson) as unknown as Person[] });
                  }
                }}
                onRemove={(id) => {
                   handleRemovePerson(id);
                   const newPeople = people.filter(p => p.id !== id);
                   updateSession({ people: newPeople });
                }}
                onUpdate={handleUpdatePerson}
                onSaveAsFriend={peopleManager.savePersonAsFriend}
                setPeople={setPeople}
              />

              <Card className="p-4 md:p-6">
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

              <SplitSummary
                personTotals={bill.personTotals}
                allItemsAssigned={bill.allItemsAssigned}
                people={people}
                billData={billData}
                itemAssignments={itemAssignments}
              />
            </div>
          )}
        </TabsContent>

        <TabsContent value="manual" className="space-y-6">
          {/* Similar to AI scan tab but without receipt uploader */}
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
            onUpdate={handleUpdatePerson}
            onSaveAsFriend={peopleManager.savePersonAsFriend}
            setPeople={setPeople}
          />

          <Card className="p-4 md:p-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
              <div className="flex items-center gap-2">
                <Receipt className="w-5 h-5 text-primary" />
                <h3 className="text-xl font-semibold">Bill Items</h3>
              </div>


            </div>

            <BillItems
              billData={billData}
              people={people}
              itemAssignments={itemAssignments}
              editingItemId={editor.editingItemId}
              editingItemName={editor.editingItemName}
              editingItemPrice={editor.editingItemPrice}
              onAssign={handleClaimItem}
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

            {billData && (
              <BillSummary
                billData={billData}
                onUpdate={(updates) => setBillData({ ...billData, ...updates })}
              />
            )}
          </Card>

          {billData && (
            <SplitSummary
              personTotals={bill.personTotals}
              allItemsAssigned={bill.allItemsAssigned}
              people={people}
              billData={billData}
              itemAssignments={itemAssignments}
            />
          )}
        </TabsContent>
      </Tabs>

      {/* Share Modal */}
      <ShareSessionModal
        isOpen={showShareModal}
        onClose={() => setShowShareModal(false)}
        sessionId={session.id}
        shareCode={session.shareCode}
        onEndSession={handleEndSession}
      />
    </>
  );
}
