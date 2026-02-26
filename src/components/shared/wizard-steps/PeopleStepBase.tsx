import { Card } from '@/components/ui/card';
import { Users } from 'lucide-react';
import { PeopleManager } from '@/components/people/PeopleManager';
import { TwoColumnLayout, ReceiptPreview } from '@/components/shared/TwoColumnLayout';
import { StepFooter } from '@/components/shared/StepFooter';
import { StepHeader } from '@/components/shared/StepHeader';
import { PaidByBanner } from './PaidByBanner';
import { Person } from '@/types';

interface PeopleStepBaseProps {
    // Data
    people: Person[];
    setPeople: (people: Person[]) => void;
    
    // People manager props (expanded or hook object)
    newPersonName: string;
    newPersonVenmoId: string;
    onNameChange: (name: string) => void;
    onVenmoIdChange: (id: string) => void;
    onAdd: (name?: string, venmoId?: string) => void;
    onAddFromFriend: (friend: any) => void;
    onRemove: (personId: string) => void;
    onUpdate: (personId: string, updates: Partial<Person>) => Promise<void>;
    onSaveAsFriend: (person: Person) => void;
    onRemoveFriend?: (friendId: string) => void;

    // Payment info
    paidById?: string;
    onPaidByChange?: (paidById: string) => void;

    // Receipt state (optional, for Bill Wizard)
    imagePreview?: string | null;
    selectedFile?: File | null;
    isUploading?: boolean;
    isAnalyzing?: boolean;
    receiptImageUrl?: string;
    onImageSelected?: (fileOrBase64: File | string) => void;
    onAnalyze?: () => void;
    onRemoveImage?: () => void;
    upload?: any;

    // Navigation (optional)
    onNext?: () => void;
    onPrev?: () => void;
    canProceed?: boolean;
    currentStep?: number;
    totalSteps?: number;
    showFooter?: boolean;

    // Utility
    isMobile: boolean;
    hasItems?: boolean;
}

/**
 * Shared People Step Base Component
 * Provides a consistent UI for the People tab across different wizards.
 */
export function PeopleStepBase({
    people,
    setPeople,
    newPersonName,
    newPersonVenmoId,
    onNameChange,
    onVenmoIdChange,
    onAdd,
    onAddFromFriend,
    onRemove,
    onUpdate,
    onSaveAsFriend,
    onRemoveFriend,
    imagePreview,
    selectedFile,
    isUploading = false,
    isAnalyzing = false,
    receiptImageUrl,
    onImageSelected,
    onAnalyze,
    onRemoveImage,
    onNext,
    onPrev,
    canProceed = true,
    currentStep = 0,
    totalSteps = 0,
    showFooter = true,
    isMobile,
    upload,
    paidById,
    onPaidByChange,
    hasItems = false
}: PeopleStepBaseProps) {
    const hasReceipt = !!(imagePreview || receiptImageUrl);

    const renderPeopleManager = () => (
        <PeopleManager
            people={people}
            newPersonName={newPersonName}
            newPersonVenmoId={newPersonVenmoId}
            onNameChange={onNameChange}
            onVenmoIdChange={onVenmoIdChange}
            onAdd={onAdd}
            onAddFromFriend={onAddFromFriend}
            onRemove={onRemove}
            onUpdate={onUpdate}
            onSaveAsFriend={onSaveAsFriend}
            onRemoveFriend={onRemoveFriend}
            setPeople={setPeople}
        >
            <PaidByBanner 
                people={people} 
                paidById={paidById} 
                onPaidByChange={onPaidByChange} 
            />
        </PeopleManager>
    );

    // Mobile with receipt: Show compact thumbnail (Bill Wizard pattern)
    if (isMobile && hasReceipt && hasItems) {
        return (
            <div>
                <Card className="bill-card-tight">
                    <StepHeader
                        icon={Users}
                        title="People"
                        showReceiptThumbnail={true}
                        selectedFile={selectedFile}
                        imagePreview={imagePreview}
                        isDragging={upload?.isDragging}
                        isUploading={isUploading}
                        isAnalyzing={isAnalyzing}
                        isMobile={isMobile}
                        receiptImageUrl={receiptImageUrl}
                        upload={upload}
                        onImageSelected={onImageSelected}
                        onAnalyze={onAnalyze}
                        onRemoveImage={onRemoveImage}
                    />

                    <div className="mobile-hide-child-chrome">
                        {renderPeopleManager()}
                    </div>
                </Card>

                {showFooter && (
                    <div className="hidden md:block">
                        <StepFooter
                            currentStep={currentStep}
                            totalSteps={totalSteps}
                            onBack={onPrev || (() => {})}
                            onNext={onNext || (() => {})}
                            nextDisabled={!canProceed}
                        />
                    </div>
                )}
            </div>
        );
    }

    // Default Layout (Single column for Simple Transaction, Two Column for Bill Wizard on Desktop)
    return (
        <div>
            <TwoColumnLayout
                imageUrl={receiptImageUrl || imagePreview || undefined}
                leftColumn={
                    !isMobile && (receiptImageUrl || imagePreview) ? (
                        <ReceiptPreview imageUrl={receiptImageUrl || imagePreview} />
                    ) : null
                }
                rightColumn={
                    <div className="flex flex-col gap-6">
                        {!hasReceipt ? (
                           <Card className="bill-card-tight">
                              <StepHeader icon={Users} title="People" />
                              <div className="mobile-hide-child-chrome">
                                {renderPeopleManager()}
                              </div>
                           </Card>
                        ) : (
                          // Desktop with receipt
                          <div className="flex flex-col gap-6">
                             {/* On desktop we don't need the header inside the card because the wizard has it, 
                                 but the shared component should probably provide it if not provided by parent */}
                             {isMobile && (
                                <Card className="bill-card-tight">
                                    <StepHeader icon={Users} title="People" />
                                    <div className="mobile-hide-child-chrome">
                                        {renderPeopleManager()}
                                    </div>
                                </Card>
                             )}
                             {!isMobile && renderPeopleManager()}
                          </div>
                        )}
                    </div>
                }
            />

            {showFooter && (
                <div className="hidden md:block">
                    <StepFooter
                        currentStep={currentStep}
                        totalSteps={totalSteps}
                        onBack={onPrev || (() => {})}
                        onNext={onNext || (() => {})}
                        nextDisabled={!canProceed}
                    />
                </div>
            )}
        </div>
    );
}
