// Resolves who is acting in a poker session: either an authenticated user
// (via Atlassian session) or a guest (via the guest cookie bound to this
// session code). Returns a normalized participant with a stable voterId.
// Guests can read + vote only; organizer actions still require the real
// authenticated organizer.

import { getSession } from "@/lib/session";
import { getGuest } from "@/lib/guest";

export type Participant = {
  voterId: string;
  name: string;
  isGuest: boolean;
  accountId: string | null; // null for guests
};

// Resolve who is acting in a poker session. For authenticated users we read
// straight from the session (which already carries accountId + name) instead
// of the heavier getViewer() path — getViewer does an extra person lookup and
// can trigger writes (firstLoginAt, membership backfill) that a read/vote
// doesn't need. Skipping it removes 1-2 sequential DB round-trips per poker
// request, which is meaningful given how often these fire.
export async function getParticipant(code: string): Promise<Participant | null> {
  const session = await getSession();
  if (session) {
    return { voterId: session.accountId, name: session.name, isGuest: false, accountId: session.accountId };
  }
  const guest = getGuest(code);
  if (guest) {
    return { voterId: guest.voterId, name: guest.name, isGuest: true, accountId: null };
  }
  return null;
}
