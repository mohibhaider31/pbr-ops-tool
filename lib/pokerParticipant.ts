// Resolves who is acting in a poker session: either an authenticated user
// (via Atlassian session) or a guest (via the guest cookie bound to this
// session code). Returns a normalized participant with a stable voterId.
// Guests can read + vote only; organizer actions still require the real
// authenticated organizer.

import { getViewer } from "@/lib/viewer";
import { getGuest } from "@/lib/guest";

export type Participant = {
  voterId: string;
  name: string;
  isGuest: boolean;
  accountId: string | null; // null for guests
};

export async function getParticipant(code: string): Promise<Participant | null> {
  const viewer = await getViewer();
  if (viewer) {
    return { voterId: viewer.accountId, name: viewer.name, isGuest: false, accountId: viewer.accountId };
  }
  const guest = getGuest(code);
  if (guest) {
    return { voterId: guest.voterId, name: guest.name, isGuest: true, accountId: null };
  }
  return null;
}
