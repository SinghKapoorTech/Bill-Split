import { BillData } from '@/types';

export const VALID_FILE_TYPES = ['image/jpeg', 'image/png', 'image/heic', 'image/heif'];
export const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB (images are compressed before upload)

export const MOCK_BILL_DATA: BillData = {
  items: [
    { id: 'item-1', name: 'Super Burrito w/ Grilled Chicken', price: 18.00 },
    { id: 'item-2', name: 'Super Burrito w/ Grilled Chicken', price: 18.00 },
    { id: 'item-3', name: 'Mexican Omelette Country Potatoes Toasted SourDough', price: 17.00 },
  ],
  subtotal: 95.00,
  tax: 8.91,
  tip: 0.00,
  total: 103.91,
};

export const MOCK_PEOPLE = [
  { id: 'person-1', name: 'Aman' },
  { id: 'person-2', name: 'Simran' }
];
