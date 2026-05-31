import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { RecurringBill, RecurringGeneratedType } from '@/types/recurring.types';
import { recurringBillService } from '@/services/recurringBillService';
import { TypeStep } from './steps/TypeStep';
import { RecurringQuickWizard } from './RecurringQuickWizard';
import { RecurringDetailedWizard } from './RecurringDetailedWizard';
import { RecurringAirbnbWizard } from './RecurringAirbnbWizard';

export interface RecurringWizardProps {
  externalTitle?: string;
  setExternalTitle?: (title: string) => void;
}

/**
 * Shell for the recurring-bill wizard. Picks a bill type first (Quick / Detailed /
 * Airbnb), then renders the matching sub-wizard. In edit mode the type is read from
 * the existing template and the picker is skipped.
 */
export function RecurringWizard({ externalTitle, setExternalTitle }: RecurringWizardProps = {}) {
  const { recurringBillId } = useParams<{ recurringBillId: string }>();
  const isEdit = !!recurringBillId && recurringBillId !== 'new';

  const [type, setType] = useState<RecurringGeneratedType | undefined>();
  // undefined = still loading (edit); null = new bill (no existing)
  const [existing, setExisting] = useState<RecurringBill | null | undefined>(isEdit ? undefined : null);

  useEffect(() => {
    if (!isEdit || !recurringBillId) return;
    let active = true;
    recurringBillService.getRecurringBill(recurringBillId).then((rb) => {
      if (!active) return;
      setExisting(rb);
      setType(rb?.generatedType ?? 'quick');
    });
    return () => { active = false; };
  }, [isEdit, recurringBillId]);

  // Loading the existing template for edit
  if (isEdit && existing === undefined) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-10 h-10 animate-spin text-primary" />
      </div>
    );
  }

  // New bill, no type chosen yet → show the type picker
  if (!type) {
    return <TypeStep onSelect={setType} />;
  }

  const onBackToType = isEdit ? undefined : () => setType(undefined);

  if (type === 'detailed') {
    return (
      <RecurringDetailedWizard
        externalTitle={externalTitle}
        setExternalTitle={setExternalTitle}
        existing={existing}
        onBackToType={onBackToType}
      />
    );
  }
  if (type === 'airbnb') {
    return (
      <RecurringAirbnbWizard
        externalTitle={externalTitle}
        setExternalTitle={setExternalTitle}
        existing={existing}
        onBackToType={onBackToType}
      />
    );
  }
  return (
    <RecurringQuickWizard
      externalTitle={externalTitle}
      setExternalTitle={setExternalTitle}
      existing={existing}
      onBackToType={onBackToType}
    />
  );
}
