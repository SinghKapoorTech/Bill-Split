import { useState } from 'react';
import { HeroSection } from '@/components/layout/HeroSection';
import { SimpleTransactionWizard } from '@/components/simple-transaction-wizard/SimpleTransactionWizard';

export default function SimpleTransactionView() {
  const [title, setTitle] = useState('');

  return (
    <>
      <HeroSection
        hasBillData={false}
        title={title}
        onTitleChange={setTitle}
        titlePlaceholder={"Quick Expense"}
      />
      <div className="w-full h-full bg-background min-h-screen">
        <SimpleTransactionWizard />
      </div>
    </>
  );
}
