import { describe, it, expect } from 'vitest';
import {
  stripUserPrefix,
  sameParticipant,
  resolveParticipantName,
  describeBillAttribution,
  buildParticipantRoles,
} from '@/utils/billParticipants';
import { Person } from '@/types/person.types';

const people: Person[] = [
  { id: 'user-RrGSa7', name: 'Aakaash Kapoor' },
  { id: 'user-sV7ZAk', name: 'Aman Singh' },
  { id: 'user-acfpmO', name: 'Anuja Nagras' },
];

const members = [{ userId: 'RrGSa7', name: 'Aakaash Kapoor' }];

describe('stripUserPrefix', () => {
  it('strips the user- prefix', () => {
    expect(stripUserPrefix('user-abc')).toBe('abc');
  });
  it('leaves raw ids untouched', () => {
    expect(stripUserPrefix('abc')).toBe('abc');
  });
  it('handles nullish', () => {
    expect(stripUserPrefix(undefined)).toBe('');
    expect(stripUserPrefix(null)).toBe('');
  });
});

describe('sameParticipant', () => {
  it('matches prefixed vs raw', () => {
    expect(sameParticipant('user-abc', 'abc')).toBe(true);
    expect(sameParticipant('abc', 'user-abc')).toBe(true);
    expect(sameParticipant('user-abc', 'user-abc')).toBe(true);
  });
  it('does not match different ids', () => {
    expect(sameParticipant('user-abc', 'xyz')).toBe(false);
  });
  it('is false for nullish', () => {
    expect(sameParticipant(undefined, 'abc')).toBe(false);
    expect(sameParticipant('abc', null)).toBe(false);
  });
});

describe('resolveParticipantName', () => {
  it('resolves a raw uid against prefixed people ids', () => {
    expect(resolveParticipantName('sV7ZAk', people)).toBe('Aman Singh');
  });
  it('resolves a prefixed id', () => {
    expect(resolveParticipantName('user-RrGSa7', people)).toBe('Aakaash Kapoor');
  });
  it('falls back to members when not in people', () => {
    expect(resolveParticipantName('RrGSa7', [], members)).toBe('Aakaash Kapoor');
  });
  it('returns null when unknown', () => {
    expect(resolveParticipantName('nope', people, members)).toBeNull();
  });
  it('returns null for nullish id', () => {
    expect(resolveParticipantName(undefined, people)).toBeNull();
  });
});

describe('buildParticipantRoles', () => {
  it('tags creator and payer separately when they differ (Aloha Melt)', () => {
    const roles = buildParticipantRoles(people, 'RrGSa7', 'sV7ZAk');
    expect(roles['user-RrGSa7']).toBe('Created');
    expect(roles['user-sV7ZAk']).toBe('Paid');
    expect(roles['user-acfpmO']).toBeUndefined();
  });
  it('combines when creator also paid (explicit paidById)', () => {
    const roles = buildParticipantRoles(people, 'RrGSa7', 'RrGSa7');
    expect(roles['user-RrGSa7']).toBe('Created, Paid');
  });
  it('combines when creator also paid (no paidById — Nachos)', () => {
    const roles = buildParticipantRoles(people, 'RrGSa7', undefined);
    expect(roles['user-RrGSa7']).toBe('Created, Paid');
    expect(roles['user-sV7ZAk']).toBeUndefined();
  });
  it('returns empty object when no owner or payer known', () => {
    expect(buildParticipantRoles(people, undefined, undefined)).toEqual({});
  });
});

describe('describeBillAttribution', () => {
  it('owner and payer differ (Aloha Melt case)', () => {
    const r = describeBillAttribution('RrGSa7', 'sV7ZAk', people, members);
    expect(r.creatorName).toBe('Aakaash Kapoor');
    expect(r.payerName).toBe('Aman Singh');
    expect(r.ownerIsPayer).toBe(false);
  });
  it('owner also paid — explicit paidById equal to owner', () => {
    const r = describeBillAttribution('RrGSa7', 'RrGSa7', people, members);
    expect(r.payerName).toBe('Aakaash Kapoor');
    expect(r.ownerIsPayer).toBe(true);
  });
  it('owner also paid — no paidById set (Nachos case)', () => {
    const r = describeBillAttribution('RrGSa7', undefined, people, members);
    expect(r.creatorName).toBe('Aakaash Kapoor');
    expect(r.payerName).toBe('Aakaash Kapoor');
    expect(r.ownerIsPayer).toBe(true);
  });
});
