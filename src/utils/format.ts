/**
 * Formats a number as currency (USD)
 * @param value - The number to format
 * @returns Formatted currency string (e.g., "$12.50")
 */
export function formatCurrency(value: number): string {
  return `$${value.toFixed(2)}`;
}
