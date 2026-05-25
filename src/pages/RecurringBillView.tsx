import { useState } from 'react';
import { HeroSection } from '@/components/layout/HeroSection';
import { RecurringWizard } from '@/components/recurring-wizard/RecurringWizard';

export default function RecurringBillView() {
  const [title, setTitle] = useState('');

  return (
    <div className="h-full flex flex-col">
      <div className="shrink-0">
        <HeroSection
          hasBillData={false}
          title={title}
          onTitleChange={setTitle}
          titlePlaceholder="Recurring Expense"
        />
      </div>
      <div className="flex-1 min-h-0 w-full bg-background">
        <RecurringWizard externalTitle={title} setExternalTitle={setTitle} />
      </div>
    </div>
  );
}
