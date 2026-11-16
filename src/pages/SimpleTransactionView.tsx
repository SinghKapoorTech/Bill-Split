import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useBillRouteInstanceKey } from '@/hooks/useBillRouteInstanceKey';
import { HeroSection } from '@/components/layout/HeroSection';
import { SimpleTransactionWizard } from '@/components/simple-transaction-wizard/SimpleTransactionWizard';

/** Fresh page + wizard per bill — see useBillRouteInstanceKey. */
export default function SimpleTransactionView() {
  return <SimpleTransactionViewContent key={useBillRouteInstanceKey()} />;
}

function SimpleTransactionViewContent() {
  const { billId } = useParams<{ billId: string }>();
  const [title, setTitle] = useState('');
  // An existing bill's title is not editable until the wizard shows the bill
  // (not over its spinner or error card). A new one renders at once.
  const [isBillRendered, setIsBillRendered] = useState(!billId || billId === 'new');

  return (
    <div className="h-full flex flex-col">
      {isBillRendered && (
        <div className="shrink-0">
          <HeroSection
            hasBillData={false}
            title={title}
            onTitleChange={setTitle}
            titlePlaceholder={"Quick Expense"}
          />
        </div>
      )}
      <div className="flex-1 min-h-0 w-full bg-background">
        <SimpleTransactionWizard
          externalTitle={title}
          setExternalTitle={setTitle}
          onBillRenderedChange={setIsBillRendered}
        />
      </div>
    </div>
  );
}
