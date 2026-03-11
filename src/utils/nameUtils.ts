/**
 * Returns 1-2 character initials from a person's name.
 * "Aman Singh" → "AS", "Jane" → "JA"
 */
export function getInitials(name: string): string {
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    return name.trim().substring(0, 2).toUpperCase();
}
