// Server-side Pusher client for broadcasting poker events to a session's room.
import Pusher from "pusher";

let instance: Pusher | null = null;

export function pusher(): Pusher {
  if (!instance) {
    instance = new Pusher({
      appId: process.env.PUSHER_APP_ID!,
      key: process.env.PUSHER_KEY!,
      secret: process.env.PUSHER_SECRET!,
      cluster: process.env.PUSHER_CLUSTER!,
      useTLS: true,
    });
  }
  return instance;
}

// Channel + event names for a poker session (keyed by invite code).
export function pokerChannel(code: string) {
  return `poker-${code}`;
}
export const POKER_EVENTS = {
  voteUpdate: "vote-update",
  revealed: "revealed",
  reVote: "re-vote",
  accepted: "accepted",
  queueUpdate: "queue-update", // stories added/changed in the queue
  navigate: "navigate", // organizer moved the room to a different story
  refinementOpen: "refinement-open", // post-accept "needs refinement?" poll started
  refinementUpdate: "refinement-update", // someone cast a refinement vote
  refinementClosed: "refinement-closed", // organizer closed the poll; score finalized
} as const;
