/**
 * Auto-acceptance of event invitations addressed to a user's email.
 *
 * Extracted out of `AuthContext` so the decision of WHETHER to join can be
 * unit tested without mounting a React provider or a Firebase auth listener —
 * see `tests/invitationGate.test.ts`.
 */

import {
  collection,
  query,
  where,
  getDocs,
  updateDoc,
  doc,
  arrayUnion,
  arrayRemove,
} from 'firebase/firestore';
import { db } from '@/config/firebase';
import { hasTrustedEmail } from '@/utils/authProviders';

/**
 * The shape of a Firebase `User` this module actually reads. Declared
 * structurally so tests can pass a plain object and callers can pass a real
 * `User` with no cast.
 */
export interface InvitationSubject {
  uid: string;
  email: string | null;
  emailVerified?: boolean;
  providerData?: ReadonlyArray<{ providerId?: string; email?: string | null } | null | undefined>;
}

/**
 * Adds the user to every event that invited their email address.
 *
 * Returns the number of events joined so callers can report it.
 */
export async function acceptPendingInvitations(user: InvitationSubject): Promise<number> {
  // An unverified address is a claim, not an identity. Joining events on the
  // strength of one would hand a stranger's bills, receipts and balances to
  // anyone who knows their email address and can fill in a signup form.
  // Verification is re-checked on later sign-ins, so a genuine user who
  // verifies later still gets their invitations.
  //
  // This is the client half only. The rule at firestore.rules:67 authorizes the
  // same join on an unverified token email, so this check is defence in depth,
  // not the enforcement point — see tests/rules/emailVerification.rules.test.ts.
  if (!hasTrustedEmail(user)) return 0;

  const eventsRef = collection(db, 'events');
  const q = query(eventsRef, where('pendingInvites', 'array-contains', user.email));
  const querySnapshot = await getDocs(q);

  if (querySnapshot.empty) return 0;

  for (const eventDoc of querySnapshot.docs) {
    await updateDoc(doc(db, 'events', eventDoc.id), {
      memberIds: arrayUnion(user.uid),
      pendingInvites: arrayRemove(user.email),
    });

    const invitationsRef = collection(db, 'eventInvitations');
    const inviteSnapshot = await getDocs(
      query(
        invitationsRef,
        where('email', '==', user.email),
        where('eventId', '==', eventDoc.id),
        where('status', '==', 'pending')
      )
    );

    for (const inviteDoc of inviteSnapshot.docs) {
      await updateDoc(doc(db, 'eventInvitations', inviteDoc.id), { status: 'accepted' });
    }
  }

  return querySnapshot.docs.length;
}
