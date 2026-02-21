import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Upload, Edit, Receipt, UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ReceiptUploader } from '@/components/receipt/ReceiptUploader';
import { PeopleManager } from '@/components/people/PeopleManager';
import { BillItems } from '@/components/bill/BillItems';
import { BillSummary } from '@/components/bill/BillSummary';
import { SplitSummary } from '@/components/people/SplitSummary';

import { InviteMembersDialog } from '@/components/events/InviteMembersDialog';
import { useBillSplitter } from '@/hooks/useBillSplitter';
import { usePeopleManager } from '@/hooks/usePeopleManager';
import { useFileUpload } from '@/hooks/useFileUpload';
import { useReceiptAnalyzer } from '@/hooks/useReceiptAnalyzer';
import { useItemEditor } from '@/hooks/useItemEditor';
import { useIsMobile } from '@/hooks/use-mobile';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '@/config/firebase';
import { TripEvent } from '@/types/event.types';
import { Person, BillData, ItemAssignment } from '@/types';
import { UI_TEXT, NAVIGATION } from '@/utils/uiConstants';
import { ensureUserInPeople } from '@/utils/billCalculations';
import { useAuth } from '@/contexts/AuthContext';
import { useUserProfile } from '@/hooks/useUserProfile';

// Firestore collection name
const EVENTS_COLLECTION = 'events';

export default function EventDetailView() {
  const { eventId } = useParams<{ eventId: string }>();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const [event, setEvent] = useState<TripEvent | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('ai-scan');
  const [inviteDialogOpen, setInviteDialogOpen] = useState(false);
  const { user } = useAuth();
  const { profile } = useUserProfile();

  // Bill splitting state
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
  const editor = useItemEditor(
    billData,
    setBillData,
    bill.removeItemAssignments
  );

  useEffect(() => {
    if (!eventId) {
      setLoading(false);
      return;
    }

    const unsubscribe = onSnapshot(
      doc(db, EVENTS_COLLECTION, eventId),
      (eventDoc) => {
        if (eventDoc.exists()) {
          const data = eventDoc.data();
          setEvent({
            id: eventDoc.id,
            name: data.name,
            description: data.description,
            createdAt: data.createdAt?.toDate() || new Date(),
            updatedAt: data.updatedAt?.toDate() || new Date(),
            ownerId: data.ownerId,
            memberIds: data.memberIds || [],
            pendingInvites: data.pendingInvites || [],
          });
        } else {
          setEvent(null);
        }
        setLoading(false);
      },
      (error) => {
        console.error('Error fetching event:', error);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [eventId]);

  const handleRemovePerson = (personId: string) => {
    peopleManager.removePerson(personId);
    bill.removePersonFromAssignments(personId);
  };

  const handleStartOver = () => {
    setBillData(null);
    setItemAssignments({});
    setPeople(ensureUserInPeople([], user, profile));
    setSplitEvenly(false);
    if (activeTab === 'ai-scan') {
      upload.handleRemoveImage();
    }
  };

  const handleImageSelected = async (base64Image: string) => {
    try {
      upload.setImagePreview(base64Image);
      const response = await fetch(base64Image);
      const blob = await response.blob();
      const file = new File([blob], 'receipt.jpg', { type: blob.type });
      upload.setSelectedFile(file);
    } catch (error) {
      console.error('Error processing selected image:', error);
    }
  };

  const handleAnalyzeReceipt = async () => {
    if (!upload.imagePreview || !upload.selectedFile) return;
    await analyzer.analyzeReceipt(upload.selectedFile, upload.imagePreview);
  };

  if (loading) {
    return <div className="text-center py-12 text-muted-foreground">Loading event...</div>;
  }

  if (!event) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground mb-4">Event not found.</p>
        <Button onClick={() => navigate('/events')}>{NAVIGATION.BACK_TO_EVENTS}</Button>
      </div>
    );
  }

  return (
    <>
      <div className="mb-8">
        <Button
          variant="ghost"
          className="mb-4 gap-2"
          onClick={() => navigate('/events')}
        >
          <ArrowLeft className="w-4 h-4" />
          {NAVIGATION.BACK_TO_EVENTS}
        </Button>

        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div className="space-y-2">
            <h2 className="text-4xl md:text-5xl font-bold bg-gradient-to-r from-primary via-primary-glow to-accent bg-clip-text text-transparent">
              {event.name}
            </h2>
            {event.description && (
              <p className="text-lg text-muted-foreground">{event.description}</p>
            )}
          </div>
          <Button onClick={() => setInviteDialogOpen(true)} className="gap-2 shrink-0">
            <UserPlus className="w-4 h-4" />
            Invite Members
          </Button>
        </div>
      </div>

      <InviteMembersDialog
        open={inviteDialogOpen}
        onOpenChange={setInviteDialogOpen}
        event={event}
      />

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="ai-scan" className="gap-2">
            <Upload className="w-4 h-4" />
            {NAVIGATION.AI_SCAN}
          </TabsTrigger>
          <TabsTrigger value="manual" className="gap-2">
            <Edit className="w-4 h-4" />
            Manual Entry
          </TabsTrigger>
        </TabsList>

        <TabsContent value="ai-scan" className="space-y-6">
          {billData && (
            <div className="flex justify-end">
              <button
                onClick={handleStartOver}
                className="text-sm text-muted-foreground hover:text-foreground underline"
              >
{UI_TEXT.START_OVER}
              </button>
            </div>
          )}

          <ReceiptUploader
            selectedFile={upload.selectedFile}
            imagePreview={upload.imagePreview}
            isDragging={upload.isDragging}
            isAnalyzing={analyzer.isAnalyzing}
            isUploading={false}
            onFileInput={upload.handleFileInput}
            onDragOver={upload.handleDragOver}
            onDragLeave={upload.handleDragLeave}
            onDrop={upload.handleDrop}
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
                onNameChange={peopleManager.setNewPersonName}
                onVenmoIdChange={peopleManager.setNewPersonVenmoId}
                onAdd={peopleManager.addPerson}
                onAddFromFriend={peopleManager.addFromFriend}
                onRemove={handleRemovePerson}
                onUpdate={async () => {}}
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
          {billData && (
            <div className="flex justify-end">
              <button
                onClick={handleStartOver}
                className="text-sm text-muted-foreground hover:text-foreground underline"
              >
{UI_TEXT.START_OVER}
              </button>
            </div>
          )}

          <div className="space-y-6">
            <PeopleManager
              people={people}
              newPersonName={peopleManager.newPersonName}
              newPersonVenmoId={peopleManager.newPersonVenmoId}
              onNameChange={peopleManager.setNewPersonName}
              onVenmoIdChange={peopleManager.setNewPersonVenmoId}
              onAdd={peopleManager.addPerson}
              onAddFromFriend={peopleManager.addFromFriend}
              onRemove={handleRemovePerson}
              onUpdate={async () => {}}
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
                  Add people above to assign items
                </p>
              )}

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
          </div>
        </TabsContent>
      </Tabs>
    </>
  );
}
