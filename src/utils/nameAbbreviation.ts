import { Person } from '@/types';

/**
 * Creates a map of person IDs to abbreviated display names.
 * 
 * Rules:
 * - Shows first name only if unique among all people
 * - If multiple people share the same first name, progressively adds characters
 *   until each name is unique, with a period to indicate truncation
 * 
 * Examples:
 * - ["Aman Singh", "Simran"] → { id1: "Aman", id2: "Simran" }
 * - ["Aman Singh", "Aman Sichi"] → { id1: "Aman Sin.", id2: "Aman Sic." }
 * - ["John"] → { id1: "John" }
 */
export function getAbbreviatedNames(people: Person[]): Record<string, string> {
    const result: Record<string, string> = {};

    if (people.length === 0) return result;

    // Group people by first name
    const firstNameGroups: Record<string, Person[]> = {};

    for (const person of people) {
        const firstName = person.name.split(' ')[0];
        if (!firstNameGroups[firstName]) {
            firstNameGroups[firstName] = [];
        }
        firstNameGroups[firstName].push(person);
    }

    // Process each group
    for (const [firstName, group] of Object.entries(firstNameGroups)) {
        if (group.length === 1) {
            // Unique first name - just use it
            result[group[0].id] = firstName;
        } else {
            // Multiple people with same first name - need to disambiguate
            const abbreviations = disambiguateNames(group);
            for (const [id, abbrev] of Object.entries(abbreviations)) {
                result[id] = abbrev;
            }
        }
    }

    return result;
}

/**
 * Disambiguates a group of people who share the same first name
 * by progressively adding characters until each is unique.
 */
function disambiguateNames(people: Person[]): Record<string, string> {
    const result: Record<string, string> = {};
    const names = people.map(p => p.name);
    const firstName = names[0].split(' ')[0];

    // Start with first name length + 1 (to include space and first char of rest)
    let charCount = firstName.length + 2;

    // Keep track of which names are still ambiguous
    let remaining = [...people];

    while (remaining.length > 1) {
        const prefixGroups: Record<string, Person[]> = {};

        for (const person of remaining) {
            const prefix = person.name.substring(0, charCount);
            if (!prefixGroups[prefix]) {
                prefixGroups[prefix] = [];
            }
            prefixGroups[prefix].push(person);
        }

        // Extract unique ones
        const stillAmbiguous: Person[] = [];
        for (const [prefix, group] of Object.entries(prefixGroups)) {
            if (group.length === 1) {
                // This one is unique now
                const person = group[0];
                const needsTruncation = prefix.length < person.name.length;
                result[person.id] = needsTruncation ? prefix + '.' : prefix;
            } else {
                stillAmbiguous.push(...group);
            }
        }

        remaining = stillAmbiguous;
        charCount++;

        // Safety: if we've used the full name, just use it
        if (charCount > Math.max(...names.map(n => n.length))) {
            for (const person of remaining) {
                result[person.id] = person.name;
            }
            break;
        }
    }

    // Handle last remaining person (if odd number with same prefix)
    if (remaining.length === 1) {
        const person = remaining[0];
        const prefix = person.name.substring(0, charCount - 1);
        const needsTruncation = prefix.length < person.name.length;
        result[person.id] = needsTruncation ? prefix + '.' : prefix;
    }

    return result;
}

/**
 * Hook-friendly function to get a single person's abbreviated name
 * given the full list of people for context.
 */
export function getAbbreviatedName(person: Person, allPeople: Person[]): string {
    const abbreviations = getAbbreviatedNames(allPeople);
    return abbreviations[person.id] || person.name;
}
