import { useState } from 'react';
import { BillData } from '@/types';
import { useToast } from './use-toast';
import { calculateBillTotals, generateItemId } from '@/utils/billCalculations';
import { validateItemInput, parsePrice } from '@/utils/validation';

/**
 * Hook for managing bill item editing and adding operations
 * @param billData - Current bill data
 * @param setBillData - Function to update bill data
 * @param customTip - Custom tip amount as string
 * @param removeItemAssignments - Function to remove item assignments
 * @returns Item editor state and handlers
 */
export function useItemEditor(
  billData: BillData | null,
  setBillData: (data: BillData) => void,
  removeItemAssignments: (itemId: string) => void,
  onAfterSave?: (newBillData: BillData) => void
) {
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editingItemName, setEditingItemName] = useState('');
  const [editingItemPrice, setEditingItemPrice] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [newItemName, setNewItemName] = useState('');
  const [newItemPrice, setNewItemPrice] = useState('');
  const { toast } = useToast();

  const editItem = (itemId: string, itemName: string, itemPrice: number) => {
    setEditingItemId(itemId);
    setEditingItemName(itemName);
    setEditingItemPrice(itemPrice.toString());
  };

  const saveEdit = () => {
    if (!billData || !editingItemId) return;

    // Validate input
    const validation = validateItemInput(editingItemName, editingItemPrice);
    if (!validation.isValid && validation.error) {
      toast({
        title: validation.error.title,
        description: validation.error.description,
        variant: 'destructive',
      });
      return;
    }

    const price = parsePrice(editingItemPrice);
    const updatedItems = billData.items.map(item =>
      item.id === editingItemId
        ? { ...item, name: editingItemName.trim(), price }
        : item
    );

    const { subtotal, total } = calculateBillTotals(updatedItems, billData.tax, billData.tip);

    const newBillData: BillData = {
      ...billData,
      items: updatedItems,
      subtotal,
      total,
    };

    setBillData(newBillData);
    onAfterSave?.(newBillData);

    cancelEdit();
  };

  const cancelEdit = () => {
    setEditingItemId(null);
    setEditingItemName('');
    setEditingItemPrice('');
  };

  const deleteItem = (itemId: string) => {
    if (!billData) return;

    const updatedItems = billData.items.filter(item => item.id !== itemId);
    const { subtotal, total } = calculateBillTotals(updatedItems, billData.tax, billData.tip);

    const newBillData: BillData = {
      ...billData,
      items: updatedItems,
      subtotal,
      total,
    };
    setBillData(newBillData);
    onAfterSave?.(newBillData);

    removeItemAssignments(itemId);

    toast({
      title: 'Item deleted',
      description: 'Item removed from the bill.',
    });
  };

  const startAdding = () => {
    setIsAdding(true);
    setNewItemName('');
    setNewItemPrice('');
  };

  const addItem = () => {
    // Validate input
    const validation = validateItemInput(newItemName, newItemPrice);
    if (!validation.isValid && validation.error) {
      toast({
        title: validation.error.title,
        description: validation.error.description,
        variant: 'destructive',
      });
      return;
    }

    const price = parsePrice(newItemPrice);
    const newItem = {
      id: generateItemId(),
      name: newItemName.trim(),
      price,
    };

    if (!billData) {
      // Create initial bill from scratch
      const newBillData: BillData = {
        items: [newItem],
        subtotal: price,
        tax: 0,
        tip: 0,
        total: price,
      };
      setBillData(newBillData);
      onAfterSave?.(newBillData);
    } else {
      // Add to existing bill
      const updatedItems = [...billData.items, newItem];
      const { subtotal, total } = calculateBillTotals(updatedItems, billData.tax, billData.tip);

      const newBillData: BillData = {
        ...billData,
        items: updatedItems,
        subtotal,
        total,
      };
      setBillData(newBillData);
      onAfterSave?.(newBillData);
    }

    toast({
      title: 'Item added',
      description: `${newItem.name} added to the bill.`,
    });

    cancelAdding();
  };

  const cancelAdding = () => {
    setIsAdding(false);
    setNewItemName('');
    setNewItemPrice('');
  };

  return {
    editingItemId,
    editingItemName,
    editingItemPrice,
    setEditingItemName,
    setEditingItemPrice,
    editItem,
    saveEdit,
    cancelEdit,
    deleteItem,
    isAdding,
    newItemName,
    newItemPrice,
    setNewItemName,
    setNewItemPrice,
    startAdding,
    addItem,
    cancelAdding,
  };
}
