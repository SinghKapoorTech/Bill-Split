import { useState } from 'react';
import { analyzeBillImage } from '@/services/gemini';
import type { BillData } from '@/types/bill.types';
import { MOCK_BILL_DATA, MOCK_PEOPLE } from '@/utils/constants';
import { Person } from '@/types';
import { useToast } from './use-toast';
import { mergeBillData } from '@/utils/billCalculations';

/**
 * Hook for analyzing receipts using AI and loading mock data
 * @param setBillData - Function to update bill data
 * @param setPeople - Function to update people list
 * @param currentBillData - Current bill data (for merging)
 * @returns Receipt analyzer state and handlers
 */
export function useReceiptAnalyzer(
  setBillData: (data: BillData | null) => void,
  setPeople: (people: Person[]) => void,
  currentBillData?: BillData | null,
) {
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const { toast } = useToast();

  const analyzeReceipt = async (
    imageFile: File,
    imagePreview: string,
  ): Promise<BillData | null> => {
    if (!imageFile || !imagePreview) return null;

    setIsAnalyzing(true);
    try {
      const data = await analyzeBillImage(imagePreview);

      // Filter out $0 items (add-ons, optional items, etc.).
      //
      // `!== 0`, NOT `> 0`: a negative line is a comp or discount, and the
      // server gate accepts it deliberately (shared/receiptAmounts.ts). Dropping
      // it here while keeping subtotal/total would OVER-COLLECT, because
      // calculatePersonTotals derives every share from the item list alone —
      // e.g. Burger $20, Burger $20, Promo -$10, total $30 would charge two
      // diners $20 each against a $30 receipt.
      const filteredData: BillData = {
        ...data,
        items: data.items.filter((item) => item.price !== 0),
      };

      // analyzeBill guarantees at least one item, but this filter runs AFTER
      // that check and can empty the array (e.g. a fully comped receipt where
      // every line is $0 but a service charge leaves a non-zero total). A bill
      // with no items distributes no money anywhere in the app, so persisting
      // one would strand the total: shown on screen, never recorded in the
      // ledger. Fail the scan instead.
      //
      // NOTE ON QUOTA: by the time this runs the server has already SUCCEEDED
      // and already consumed one of the user's monthly scans. This guard is
      // still correct -- persisting an item-less bill is the worse outcome, and
      // there is deliberately no refund path (a server-successful scan costs a
      // scan) -- but it means a user can pay a scan and be shown "Analysis
      // Failed". That is rare, and it got twice as expensive when the free cap
      // moved from 5 to 2. The copy is the part that is wrong, not the guard:
      // the analysis did not fail, the receipt is unsplittable. Phase 3 owns
      // this message.
      if (filteredData.items.length === 0) {
        throw new Error('No items found on the receipt');
      }

      let finalData: BillData;
      if (currentBillData) {
        finalData = mergeBillData(currentBillData, filteredData);
        setBillData(finalData);
      } else {
        finalData = filteredData;
        setBillData(filteredData);
      }
      return finalData;
    } catch (error) {
      console.error('useReceiptAnalyzer error:', error);
      toast({
        title: 'Analysis Failed',
        description:
          error instanceof Error ? error.message : 'Could not analyze receipt. Please try again.',
        variant: 'destructive',
      });
      return null;
    } finally {
      setIsAnalyzing(false);
    }
  };

  const loadMockData = () => {
    setBillData(MOCK_BILL_DATA);
    setPeople(MOCK_PEOPLE);
    toast({
      title: 'Mock data loaded',
      description: `Loaded ${MOCK_BILL_DATA.items.length} test items.`,
    });
  };

  return {
    isAnalyzing,
    analyzeReceipt,
    loadMockData,
  };
}
