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

      // Recursively clean nested objects (but not arrays or special types)
      if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
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
        // Primitive, array, or special type - keep as-is
        cleaned[key] = value;
      }
    }
  }

  return cleaned as Partial<T>;
}
