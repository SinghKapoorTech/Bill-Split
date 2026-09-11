/**
 * @fileOverview Extracts bill details (line items with prices, tax, tip, total) from an image of a restaurant bill using Firebase Cloud Functions.
 *
 * This service now calls a secure Firebase Cloud Function that handles Gemini AI API calls server-side,
 * protecting the API key from client-side exposure.
 *
 * - analyzeBillImage - A function that handles the bill extraction process via Cloud Function
 * - BillItem - Individual line item with name and price
 * - BillData - The complete extracted bill data structure
 */

import { getFunctions, httpsCallable } from 'firebase/functions';
import { app } from '@/config/firebase';
import { analyzeBillErrorFrom } from '@/utils/analyzeBillError';

/**
 * Represents a single line item on the bill
 */
export interface BillItem {
  id: string;
  name: string;
  price: number;
}

import type { BillData } from '@/types/bill.types';

// Initialize Firebase Functions
const functions = getFunctions(app);

/**
 * Analyzes a restaurant bill image and extracts structured data
 *
 * This function calls a Firebase Cloud Function that securely handles the Gemini AI API call.
 * The API key is stored server-side and never exposed to clients.
 *
 * @param base64Image - A photo of a restaurant bill, as a data URI with MIME type and Base64 encoding
 * @returns Promise containing extracted bill data with line items, tax, tip, and total
 */
export async function analyzeBillImage(base64Image: string): Promise<BillData> {
  try {
    // Call the Cloud Function with a 2-minute timeout
    const analyzeBill = httpsCallable<{ base64Image: string }, BillData>(functions, 'analyzeBill', {
      timeout: 120000,
    });
    const result = await analyzeBill({ base64Image });

    return result.data;
  } catch (error: unknown) {
    console.error('Error analyzing bill:', error);
    // NOT `new Error(mapAnalyzeBillError(error))` — that flattened the callable
    // and discarded `.details`, so every scan-quota rejection reached the UI as
    // a bare string and the free-tier wall could not tell itself apart from the
    // hourly rate limiter. The user-facing message is identical; the structured
    // payload now survives the rewrap.
    throw analyzeBillErrorFrom(error);
  }
}
