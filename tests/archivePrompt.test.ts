import { describe, it, expect } from 'vitest';
import { archivePromptCopy, finishedBillCount, shouldOfferArchive } from '@/utils/archivePrompt';

const SETTLED = { isOwner: true, archived: false, ledgerLoading: false, billCount: 3, debtCount: 0 };

describe('shouldOfferArchive — inviting the owner to archive a finished group', () => {
  it('offers it once there were bills and nobody owes anything', () => {
    expect(shouldOfferArchive(SETTLED)).toBe(true);
  });

  it('not while money is still owed', () => {
    expect(shouldOfferArchive({ ...SETTLED, debtCount: 1 })).toBe(false);
  });

  it('not while the ledger is loading (it would flash on a group with debts)', () => {
    expect(shouldOfferArchive({ ...SETTLED, ledgerLoading: true })).toBe(false);
  });

  it('not on a group where nothing has happened yet', () => {
    expect(shouldOfferArchive({ ...SETTLED, billCount: 0 })).toBe(false);
  });

  it('not to a member — archive is owner-only', () => {
    expect(shouldOfferArchive({ ...SETTLED, isOwner: false })).toBe(false);
  });

  it('not on a group that is already archived', () => {
    expect(shouldOfferArchive({ ...SETTLED, archived: true })).toBe(false);
  });
});

describe('archivePromptCopy — only a capped user is told it "makes room"', () => {
  it('a capped free user: make room', () => {
    expect(archivePromptCopy({ capped: true })).toBe('make-room');
  });
  it('Pro, or the paywall off: just tidy', () => {
    expect(archivePromptCopy({ capped: false })).toBe('tidy');
  });
  it('still loading: the neutral wording, never a claim about slots', () => {
    expect(archivePromptCopy({ capped: null })).toBe('tidy');
  });
});

describe('finishedBillCount — drafts do not make a group "settled up"', () => {
  it('ignores drafts and counts everything else', () => {
    expect(finishedBillCount([{ status: 'draft' }])).toBe(0);
    expect(finishedBillCount([{ status: 'draft' }, { status: 'active' }, {}])).toBe(2);
  });
});
