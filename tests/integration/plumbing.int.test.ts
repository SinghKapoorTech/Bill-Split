import { describe, it, expect, beforeEach } from 'vitest';
import { db, clearFirestore } from './helpers/env';

describe('integration plumbing', () => {
  beforeEach(clearFirestore);

  it('round-trips a document through the Firestore emulator', async () => {
    await db.collection('smoke').doc('x').set({ ok: true, n: 42 });
    const snap = await db.collection('smoke').doc('x').get();
    expect(snap.data()).toEqual({ ok: true, n: 42 });
  });

  it('clearFirestore wipes previously written data', async () => {
    await db.collection('smoke').doc('y').set({ ok: true });
    await clearFirestore();
    const snap = await db.collection('smoke').doc('y').get();
    expect(snap.exists).toBe(false);
  });
});
