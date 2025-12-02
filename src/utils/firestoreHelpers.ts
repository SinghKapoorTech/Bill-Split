import { FieldValue } from 'firebase/firestore';

/**
 * Recursively removes undefined values from an object.
 * Firestore doesn't accept undefined values - they must be omitted or set to null.
 * 
 * @param obj - The object to clean
 * @returns A new object with all undefined values removed
 */
export function removeUndefinedFields<T extends Record<string, any>>(obj: T): Partial<T> {
  const cleaned: Record<string, any> = {};

  for (const key in obj) {
    if (obj.hasOwnProperty(key)) {
      const value = obj[key];

      // Skip undefined values entirely
      if (value === undefined) {
        continue;
      }

      // Handle arrays - recursively clean each element and remove undefined items
      if (Array.isArray(value)) {
        cleaned[key] = value
          .filter(item => item !== undefined)
          .map(item => {
            if (item !== null && typeof item === 'object' && !Array.isArray(item)) {
              // Check for special types
              if (item instanceof FieldValue) {
                return item;
              }
              const isDate = Object.prototype.toString.call(item) === '[object Date]';
              if (isDate || item.toDate || item.seconds !== undefined) {
                return item; // Keep special types as-is
              }
              return removeUndefinedFields(item); // Recurse for objects in arrays
            }
            return item; // Keep primitives as-is
          });
      }
      // Recursively clean nested objects (but not arrays or special types)
      else if (value !== null && typeof value === 'object') {
        // Check for FieldValue (serverTimestamp, deleteField, etc.)
        if ((value as any) instanceof FieldValue) {
          cleaned[key] = value;
          continue;
        }

        // Check if it's a Date object
        const isDate = Object.prototype.toString.call(value) === '[object Date]';
        
        // Check if it's a Firestore Timestamp or other special type
        if (isDate || value.toDate || value.seconds !== undefined) {
          // It's a Date, Timestamp, or special type - keep as-is
          cleaned[key] = value;
        } else {
          // Regular object, recurse
          cleaned[key] = removeUndefinedFields(value);
        }
      } else {
        // Primitive - keep as-is
        cleaned[key] = value;
      }
    }
  }

  return cleaned as Partial<T>;
}
