/**
 * The create dialog is the ONLY place an event id is checked before it becomes
 * a new bill's `targetEventId` — SimpleTransactionWizard, AirbnbView and
 * AIScanView all consume `routerState.targetEventId` verbatim. So the rule
 * these tests defend is narrow and absolute: an event id reaches a wizard only
 * after it has been read and found un-archived. "Not checked yet" and "could
 * not check" are NOT event targets.
 */
import { describe, it, expect } from 'vitest';
import {
  eventContextForCreate,
  targetFromEventDoc,
  type EventCreateTarget,
} from '@/utils/eventCreateTarget';

describe('targetFromEventDoc', () => {
  it('treats an event with no archived field as an active target (pre-feature document)', () => {
    expect(targetFromEventDoc('e1', { name: 'Vegas' })).toEqual({
      status: 'ready',
      targetEventId: 'e1',
      targetEventName: 'Vegas',
    });
  });

  it('treats archived: false as an active target', () => {
    expect(targetFromEventDoc('e1', { name: 'Vegas', archived: false })).toMatchObject({
      status: 'ready',
    });
  });

  it('classifies an archived event as archived, not as a target', () => {
    expect(targetFromEventDoc('e1', { name: 'Vegas', archived: true })).toEqual({
      status: 'archived',
    });
  });

  it('classifies a missing event document as no event', () => {
    expect(targetFromEventDoc('e1', undefined)).toEqual({ status: 'none' });
  });

  it('falls back to the caller-supplied name, then to a generic label', () => {
    expect(targetFromEventDoc('e1', {}, 'From the URL')).toMatchObject({
      targetEventName: 'From the URL',
    });
    expect(targetFromEventDoc('e1', {})).toMatchObject({ targetEventName: 'Event' });
  });
});

describe('eventContextForCreate — only a verified, active event becomes a bill target', () => {
  it('hands the wizards nothing while the archive check is still in flight', () => {
    // THE RACE: the dialog is interactive the instant it opens, long before the
    // getDoc resolves. If `checking` leaked the id, tapping "Quick Expense"
    // fast enough would drop a bill into an archived event.
    expect(eventContextForCreate({ status: 'checking' })).toBeUndefined();
  });

  it('hands the wizards nothing for an archived event', () => {
    expect(eventContextForCreate({ status: 'archived' })).toBeUndefined();
  });

  it('hands the wizards nothing when there is no event (including a failed read)', () => {
    expect(eventContextForCreate({ status: 'none' })).toBeUndefined();
  });

  it('passes the context through only once the event is confirmed active', () => {
    expect(
      eventContextForCreate({
        status: 'ready',
        targetEventId: 'e1',
        targetEventName: 'Vegas',
      }),
    ).toEqual({ targetEventId: 'e1', targetEventName: 'Vegas' });
  });

  it('is undefined for every state except ready', () => {
    // Guards the whole enum at once: adding a state must not silently default
    // to "carry the event id".
    const states: EventCreateTarget[] = [
      { status: 'none' },
      { status: 'checking' },
      { status: 'archived' },
    ];
    for (const state of states) {
      expect(eventContextForCreate(state)).toBeUndefined();
    }
  });
});

describe('the archived path is reachable end to end', () => {
  it('an archived event document yields no create context', () => {
    // The two halves wired together the way the dialog wires them: fetch →
    // classify → hand to navigateWithOrigin.
    const target = targetFromEventDoc('e1', { name: 'Vegas', archived: true }, '');
    expect(eventContextForCreate(target)).toBeUndefined();
  });
});
