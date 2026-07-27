export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getViewer } from "@/lib/viewer";
import { can } from "@/lib/permissions";
import { DECK } from "@/lib/poker";
import { pusher, pokerChannel, POKER_EVENTS } from "@/lib/pusher-server";

// Cast/change my card for the current round (only while VOTING). Card stays
// hidden from others; we broadcast only that the vote COUNT changed.
export async function POST(req: Request, { params }: { params: { code: string } }) {
  const viewer = await getViewer();
  if (!viewer) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!can({ role: viewer.role, isAdmin: viewer.isAdmin }, "poker_vote"))
    return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const { card }: { card: string } = await req.json();
  if (!DECK.includes(card)) return NextResponse.json({ error: "invalid card" }, { status: 400 });

  const session = await prisma.pokerSession.findUnique({ where: { code: params.code } });
  if (!session) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (session.state !== "VOTING")
    return NextResponse.json({ error: "voting closed" }, { status: 409 });

  await prisma.pokerVote.upsert({
    where: {
      sessionId_round_voterId: { sessionId: session.id, round: session.round, voterId: viewer.accountId },
    },
    create: {
      sessionId: session.id,
      round: session.round,
      voterId: viewer.accountId,
      voterName: viewer.name,
      card,
    },
    update: { card },
  });

  const count = await prisma.pokerVote.count({
    where: { sessionId: session.id, round: session.round },
  });

  // Broadcast that someone voted (count + who), cards stay hidden.
  await pusher().trigger(pokerChannel(session.code), POKER_EVENTS.voteUpdate, {
    voterId: viewer.accountId,
    voterName: viewer.name,
    count,
  });

  return NextResponse.json({ ok: true });
}
