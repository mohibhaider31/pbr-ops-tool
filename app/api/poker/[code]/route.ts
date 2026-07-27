export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getViewer } from "@/lib/viewer";
import { analyze } from "@/lib/poker";

// Current session state. Votes for the current round are returned with cards
// HIDDEN unless the session is REVEALED (or it's the viewer's own vote).
export async function GET(_req: Request, { params }: { params: { code: string } }) {
  const viewer = await getViewer();
  if (!viewer) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const session = await prisma.pokerSession.findUnique({
    where: { code: params.code },
    include: { votes: true },
  });
  if (!session) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const roundVotes = session.votes.filter((v) => v.round === session.round);
  const revealed = session.state === "REVEALED";

  const participants = roundVotes.map((v) => ({
    voterId: v.voterId,
    voterName: v.voterName,
    voted: true,
    // card only visible when revealed or it's the viewer's own
    card: revealed || v.voterId === viewer.accountId ? v.card : null,
  }));

  const analysis = revealed
    ? analyze(roundVotes.map((v) => ({ voterId: v.voterId, voterName: v.voterName, card: v.card })))
    : null;

  return NextResponse.json({
    code: session.code,
    jiraKey: session.jiraKey,
    summary: session.summary,
    organizerId: session.organizerId,
    organizerName: session.organizerName,
    state: session.state,
    round: session.round,
    finalPoints: session.finalPoints,
    isOrganizer: session.organizerId === viewer.accountId,
    myVote: roundVotes.find((v) => v.voterId === viewer.accountId)?.card ?? null,
    participants,
    analysis,
  });
}
