/**
 * Shared types used by both the client app and Cloud Functions.
 * Pure TypeScript — no Firebase, no browser APIs.
 *
 * These are structurally compatible with the richer client types in src/types/,
 * so TypeScript's structural typing makes them assignment-compatible.
 */

export interface BillItem {
  id: string;
  name: string;
  price: number;
}

export interface BillData {
  items: BillItem[];
  subtotal: number;
  tax: number;
  tip: number;
  total: number;
}

export interface Person {
  id: string;
  name: string;
}

export interface PersonTotal {
  personId: string;
  name: string;
  itemsSubtotal: number;
  tax: number;
  tip: number;
  total: number;
}

export type ItemAssignment = Record<string, string[]>;
