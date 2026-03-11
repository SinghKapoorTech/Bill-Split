import { Card } from '@/components/ui/card';
import { Users } from 'lucide-react';
import { PeopleManager } from '@/components/people/PeopleManager';
import { TwoColumnLayout, ReceiptPreview } from '@/components/shared/TwoColumnLayout';
import { StepFooter } from '@/components/shared/StepFooter';
import { StepHeader } from '@/components/shared/StepHeader';
import { PaidByBanner } from './PaidByBanner';
import { Person } from '@/types';
import { EventSelector } from '@/components/events/EventSelector';

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

    // Event Info
    eventId?: string | null;
    onEventChange?: (eventId: string | null) => void;
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
    hasItems = false,
    eventId,
    onEventChange
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

    const renderEventSelector = () => {
        if (!onEventChange) return null;
        return (
            <div className="mb-4 flex items-center justify-end">
                <EventSelector
                    selectedEventId={eventId}
                    onSelect={onEventChange}
                    className="w-auto min-w-[150px] max-w-[200px] h-9 text-xs bg-background hover:bg-accent transition-colors border-border/50"
                />
            </div>
        );
    };

    // Mobile with receipt: Show compact thumbnail (Bill Wizard pattern)
    if (isMobile && hasReceipt && hasItems) {
        return (
            <div>
                <Card className="bill-card-tight">
                    <StepHeader
                        icon={Users}
                        title="People"
                        actions={renderEventSelector()}
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
                            onBack={onPrev || (() => { })}
                            onNext={onNext || (() => { })}
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
                                <StepHeader icon={Users} title="People" actions={renderEventSelector()} />
                                <div className="mobile-hide-child-chrome">
                                    {renderPeopleManager()}
                                </div>
                            </Card>
                        ) : (
                            // Desktop with receipt
                            <div className="flex flex-col gap-6">
                                {isMobile && (
                                    <Card className="bill-card-tight">
                                        <StepHeader icon={Users} title="People" actions={renderEventSelector()} />
                                        <div className="mobile-hide-child-chrome">
                                            {renderPeopleManager()}
                                        </div>
                                    </Card>
                                )}
                                {!isMobile && (
                                    <div className="w-full flex justify-end mb-2">
                                        {renderEventSelector()}
                                    </div>
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
                        onBack={onPrev || (() => { })}
                        onNext={onNext || (() => { })}
                        nextDisabled={!canProceed}
                    />
                </div>
            )}
        </div>
    );
}
