import { Person } from '@/types/person.types';

/**
 * People and members store user ids inconsistently: `people[].id` is usually
 * the `user-<uid>` prefixed form, `members[].userId` and `ownerId`/`paidById`
 * are usually the raw Firebase uid. Normalize by stripping the prefix so the
 * two can be compared.
 */
export function stripUserPrefix(id: string | undefined | null): string {
  if (!id) return '';
  return id.startsWith('user-') ? id.slice(5) : id;
}

/** True when two ids refer to the same user, regardless of `user-` prefixing. */
export function sameParticipant(
  a: string | undefined | null,
  b: string | undefined | null
): boolean {
  if (!a || !b) return false;
  return stripUserPrefix(a) === stripUserPrefix(b);
}

type MemberLike = { userId?: string; name?: string };

/**
 * Resolve a participant's display name from a bill's `people` list, falling
 * back to its `members` list. Matches on the raw uid in either prefixed or
 * unprefixed form. Returns null when no name can be found.
 */
export function resolveParticipantName(
  id: string | undefined | null,
  people: Person[] = [],
  members: MemberLike[] = []
): string | null {
  if (!id) return null;

  const person = people.find((p) => sameParticipant(p.id, id));
  if (person?.name) return person.name;

  const member = members.find((m) => sameParticipant(m.userId, id));
  if (member?.name) return member.name;

  return null;
}

/**
 * Role tags for display next to each person's name — 'Created' for whoever made
 * the bill (`ownerId`), 'Paid' for whoever paid (`paidById || ownerId`). A
 * person who did both gets 'Created, Paid'. Keyed by `people[].id`; people with
 * no role are omitted.
 */
export function buildParticipantRoles(
  people: Person[] = [],
  ownerId: string | undefined | null,
  paidById: string | undefined | null
): Record<string, string> {
  const creditorId = paidById || ownerId;
  const labels: Record<string, string> = {};
  for (const p of people) {
    const roles: string[] = [];
    if (sameParticipant(p.id, ownerId)) roles.push('Created');
    if (sameParticipant(p.id, creditorId)) roles.push('Paid');
    if (roles.length) labels[p.id] = roles.join(', ');
  }
  return labels;
}

/**
 * Describe who created and who paid for a bill, for the 'Created by / Paid by'
 * header on the shared view. `creditorId` is `paidById || ownerId` (mirrors the
 * ledger's creditor resolution). `ownerIsPayer` is true when the creator also
 * paid, so the header can collapse to a single line.
 */
export function describeBillAttribution(
  ownerId: string | undefined | null,
  paidById: string | undefined | null,
  people: Person[] = [],
  members: MemberLike[] = []
): {
  creatorName: string | null;
  payerName: string | null;
  ownerIsPayer: boolean;
} {
  const creditorId = paidById || ownerId;
  return {
    creatorName: resolveParticipantName(ownerId, people, members),
    payerName: resolveParticipantName(creditorId, people, members),
    ownerIsPayer: !paidById || sameParticipant(paidById, ownerId),
  };
}
