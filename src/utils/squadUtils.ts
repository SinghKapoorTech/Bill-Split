import { Person } from '@/types';
import { SquadMember } from '@/types/squad.types';
import { generateUserId } from '@/utils/billCalculations';

/**
 * Validates a squad name
 * @param name - The squad name to validate
 * @returns true if valid, false otherwise
 */
export function validateSquadName(name: string): boolean {
  return name.trim().length >= 1 && name.trim().length <= 50;
}

/**
 * Validates squad members array
 * @param members - The members array to validate
 * @returns true if valid (at least 2 members), false otherwise
 */
export function validateSquadMembers(members: SquadMember[]): boolean {
  return members.length >= 2 && members.every(member => member.name.trim().length > 0);
}

/**
 * Converts Person array to SquadMember array
 * @param people - Array of Person objects
 * @returns Array of SquadMember objects
 */
export function convertPeopleToSquadMembers(people: Person[]): SquadMember[] {
  return people.map(person => ({
    name: person.name,
    ...(person.venmoId && { venmoId: person.venmoId }),
  }));
}

/**
 * Converts SquadMember array to Person array
 * @param members - Array of SquadMember objects
 * @returns Array of Person objects with generated IDs
 */
export function convertSquadMembersToPeople(members: SquadMember[]): Person[] {
  return members.map(member => ({
    // If member has a resolved Firebase UID, format it as `user-{uid}` to match
    // the ID format used by ensureUserInPeople / generateUserId everywhere in bills.
    // This ensures the current user (and any real app user) is correctly deduplicated.
    id: member.id ? generateUserId(member.id) : `person-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
    name: member.name,
    ...(member.venmoId && { venmoId: member.venmoId }),
  }));
}

/**
 * Generates a unique squad ID
 * @returns A unique identifier string
 */
export function generateSquadId(): string {
  return `squad-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Filters members to exclude the current user
 * @param members - Array of SquadMember objects
 * @param userDisplayName - The current user's display name
 * @returns Filtered array without the current user
 */
export function excludeCurrentUser(members: SquadMember[], userDisplayName?: string): SquadMember[] {
  if (!userDisplayName) return members;
  return members.filter(member => member.name !== userDisplayName);
}

/**
 * Checks if a squad member already exists in an array
 * @param members - Array of existing members
 * @param newMember - Member to check
 * @returns true if member already exists, false otherwise
 */
export function memberExists(members: SquadMember[], newMember: SquadMember): boolean {
  return members.some(
    member =>
      member.name.toLowerCase() === newMember.name.toLowerCase() &&
      member.venmoId?.toLowerCase() === newMember.venmoId?.toLowerCase()
  );
}

/**
 * Sanitizes squad member data by trimming whitespace
 * @param member - SquadMember to sanitize
 * @returns Sanitized SquadMember
 */
export function sanitizeSquadMember(member: SquadMember): SquadMember {
  return {
    name: member.name.trim(),
    ...(member.venmoId && { venmoId: member.venmoId.trim() }),
  };
}

/**
 * Sanitizes an array of squad members
 * @param members - Array of SquadMembers to sanitize
 * @returns Sanitized array
 */
export function sanitizeSquadMembers(members: SquadMember[]): SquadMember[] {
  return members.map(sanitizeSquadMember);
}
