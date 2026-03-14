/**
 * Utilities for generating and managing shareable session codes
 */

/**
 * Generates a random 6-character share code
 * Uses alphanumeric characters excluding confusing ones (0, O, I, 1)
 * @returns 6-character code like "AB3X9K"
 */
export function generateShareCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Exclude 0, O, I, 1
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

/**
 * Generates a shareable link for a collaborative session
 * @param sessionId - The collaborative session ID
 * @param shareCode - The 6-character share code
 * @returns Full URL that can be shared
 */
export function generateShareableLink(sessionId: string, shareCode: string): string {
  const baseUrl = import.meta.env.VITE_APP_URL || 'https://bill-split-omega.vercel.app';
  return `${baseUrl}/join/${sessionId}?code=${shareCode}`;
}

/**
 * Validates a share code format
 * @param code - The code to validate
 * @returns true if valid format
 */
export function isValidShareCode(code: string): boolean {
  const validChars = /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/;
  return validChars.test(code);
}

/**
 * Generates a unique session ID
 * @returns Unique session ID
 */
export function generateSessionId(): string {
  return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}
