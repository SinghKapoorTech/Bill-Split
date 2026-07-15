/**
 * Minimal-valid Firestore document builders for integration tests.
 * Conventions (mirror production):
 *   - linked person id  = `user-<uid>`  (raw uid in participantIds)
 *   - unlinked/guest id = `person-<name>`
 *   - paidById / ownerId = raw Firebase UID
 */
import { Timestamp, type DocumentData } from 'firebase-admin/firestore';

export interface TestPerson {
  name: string;
  uid?: string;      // linked Firebase user
  localId?: string;  // explicit unlinked id (defaults to person-<name>)
}

export function personId(p: TestPerson): string {
  return p.uid ? `user-${p.uid}` : (p.localId ?? `person-${p.name.toLowerCase()}`);
}

export interface MakeBillOptions {
  ownerId: string;
  people: TestPerson[];
  items: Array<{ name: string; price: number }>;
  /** itemId ('item-1', 'item-2', …) → array of person ids (use personId()) */
  itemAssignments?: Record<string, string[]>;
  splitEvenly?: boolean;
  tax?: number;
  tip?: number;
  paidById?: string;   // raw uid
  eventId?: string;
  settledPersonIds?: string[];
}

export function makeBill(opts: MakeBillOptions): DocumentData {
  const people = opts.people.map(p => ({ id: personId(p), name: p.name }));
  const items = opts.items.map((it, i) => ({ id: `item-${i + 1}`, name: it.name, price: it.price }));
  const subtotal = opts.items.reduce((s, it) => s + it.price, 0);
  const tax = opts.tax ?? 0;
  const tip = opts.tip ?? 0;
  const participantIds = opts.people.flatMap(p => (p.uid ? [p.uid] : []));
  const now = Timestamp.now();
  return {
    billType: opts.eventId ? 'event' : 'private',
    ownerId: opts.ownerId,
    ...(opts.paidById && { paidById: opts.paidById }),
    ...(opts.eventId && { eventId: opts.eventId }),
    billData: {
      items,
      subtotal,
      tax,
      tip,
      total: subtotal + tax + tip,
      restaurantName: 'Test Diner',
    },
    people,
    itemAssignments: opts.itemAssignments ?? {},
    splitEvenly: opts.splitEvenly ?? false,
    settledPersonIds: opts.settledPersonIds ?? [],
    participantIds,
    createdAt: now,
    updatedAt: now,
    lastActivity: now,
  };
}

export function makeUser(opts: { friends?: string[]; venmoId?: string } = {}): DocumentData {
  return { friends: opts.friends ?? [], ...(opts.venmoId && { venmoId: opts.venmoId }) };
}

export function makeEvent(opts: { ownerId: string; memberIds: string[]; name?: string }): DocumentData {
  const now = Timestamp.now();
  return {
    name: opts.name ?? 'Test Trip',
    ownerId: opts.ownerId,
    memberIds: opts.memberIds,
    createdAt: now,
    updatedAt: now,
  };
}
