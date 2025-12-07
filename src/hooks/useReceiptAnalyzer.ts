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
  currentBillData?: BillData | null
) {
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const { toast } = useToast();

  const analyzeReceipt = async (
    imageFile: File,
    imagePreview: string
  ): Promise<BillData | null> => {
    if (!imageFile || !imagePreview) return null;

    setIsAnalyzing(true);
    try {
      const data = await analyzeBillImage(imagePreview);
      
      // Filter out $0 items (add-ons, optional items, etc.)
      const filteredData: BillData = {
        ...data,
        items: data.items.filter(item => item.price > 0),
      };

      let finalData: BillData;
      if (currentBillData) {
        finalData = mergeBillData(currentBillData, filteredData);
        setBillData(finalData);
        toast({
          title: 'Success!',
          description: `Added ${filteredData.items.length} new items to your bill.`,
        });
      } else {
        finalData = filteredData;
        setBillData(filteredData);
        toast({
          title: 'Success!',
          description: `Extracted ${filteredData.items.length} items from your receipt.`,
        });
      }
      return finalData;
    } catch (error) {
      console.error('useReceiptAnalyzer error:', error);
      toast({
        title: 'Analysis Failed',
        description:
          error instanceof Error
            ? error.message
            : 'Could not analyze receipt. Please try again.',
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
