export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getParticipant } from "@/lib/pokerParticipant";
import { DECK } from "@/lib/poker";
import { pusher, pokerChannel, POKER_EVENTS } from "@/lib/pusher-server";

// Cast/change a vote. Both authenticated participants and session guests may
// vote — voting is the one thing a guest is allowed to do, and only in the
// session their guest cookie is bound to.
export async function POST(req: Request, { params }: { params: { code: string; itemId: string } }) {
  const me = await getParticipant(params.code);
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { card }: { card: string } = await req.json();
  if (!DECK.includes(card)) return NextResponse.json({ error: "invalid card" }, { status: 400 });

  const item = await prisma.pokerItem.findUnique({ where: { id: params.itemId } });
  if (!item) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (item.state !== "VOTING") return NextResponse.json({ error: "voting closed" }, { status: 409 });

  // Ensure this item belongs to the session the participant is in (guests are
  // bound to one code; this stops a guest cookie voting on another session).
  const session = await prisma.pokerSession.findUnique({ where: { id: item.sessionId } });
  if (!session || session.code !== params.code)
    return NextResponse.json({ error: "wrong session" }, { status: 403 });

  await prisma.pokerVote.upsert({
    where: { itemId_round_voterId: { itemId: item.id, round: item.round, voterId: me.voterId } },
    create: { itemId: item.id, round: item.round, voterId: me.voterId, voterName: me.name, card },
    update: { card },
  });
  await pusher().trigger(pokerChannel(params.code), POKER_EVENTS.voteUpdate, { itemId: item.id });
  return NextResponse.json({ ok: true });
}
