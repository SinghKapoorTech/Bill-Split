import { useState } from 'react';
import { HeroSection } from '@/components/layout/HeroSection';
import { SimpleTransactionWizard } from '@/components/simple-transaction-wizard/SimpleTransactionWizard';

export default function SimpleTransactionView() {
  const [title, setTitle] = useState('');

  return (
    <div className="h-full flex flex-col">
      <div className="shrink-0">
        <HeroSection
          hasBillData={false}
          title={title}
          onTitleChange={setTitle}
          titlePlaceholder={"Quick Expense"}
        />
      </div>
      <div className="flex-1 min-h-0 w-full bg-background">
        <SimpleTransactionWizard externalTitle={title} setExternalTitle={setTitle} />
      </div>
    </div>
  );
}
