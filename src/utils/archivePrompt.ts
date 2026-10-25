/**
 * Whether a group's own page should invite its owner to archive it.
 *
 * The natural moment is "this trip is over": there were bills, and nobody owes
 * anything now. Never while the ledger is still loading (it would flash on a
 * group that does have debts), never on a group with no bills (nothing has
 * happened yet), never to a member (archive is owner-only in firestore.rules),
 * and never on a group that is already archived.
 */
/**
 * Bills that count as "something happened here". Drafts are the owner's own
 * unfinished bills: a group whose only bill is a draft has not started, so it
 * is not "settled up".
 */
export function finishedBillCount(bills: ReadonlyArray<{ status?: string }>): number {
  return bills.filter((b) => b.status !== 'draft').length;
}

export type ArchivePromptCopy = 'make-room' | 'tidy';

/**
 * What the prompt says. Only a user who is actually capped (paywall on, not on
 * an unlimited plan, both known) is told archiving "makes room" — a Pro user,
 * or anyone while the paywall is off, has no slot to free.
 */
export function archivePromptCopy(args: {
  capped: boolean | null;
}): ArchivePromptCopy {
  return args.capped === true ? 'make-room' : 'tidy';
}

export function shouldOfferArchive(args: {
  isOwner: boolean;
  archived: boolean;
  ledgerLoading: boolean;
  billCount: number;
  debtCount: number;
}): boolean {
  const { isOwner, archived, ledgerLoading, billCount, debtCount } = args;
  return isOwner && !archived && !ledgerLoading && billCount > 0 && debtCount === 0;
}
