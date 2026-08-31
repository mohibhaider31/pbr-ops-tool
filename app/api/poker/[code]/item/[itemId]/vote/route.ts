export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { waitUntil } from "@vercel/functions";
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

  // One query for the item, its session (to verify the guest is voting in the
  // session their cookie is bound to) and the existing votes. Previously this
  // was three separate sequential round-trips.
  const item = await prisma.pokerItem.findUnique({
    where: { id: params.itemId },
    include: { session: true, votes: true },
  });
  if (!item) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (item.state !== "VOTING") return NextResponse.json({ error: "voting closed" }, { status: 409 });
  if (item.session.code !== params.code)
    return NextResponse.json({ error: "wrong session" }, { status: 403 });

  await prisma.pokerVote.upsert({
    where: { itemId_round_voterId: { itemId: item.id, round: item.round, voterId: me.voterId } },
    create: { itemId: item.id, round: item.round, voterId: me.voterId, voterName: me.name, card },
    update: { card },
  });

  // Derive the new voter roster in memory rather than re-querying: we already
  // have this round's votes, and we know exactly what just changed.
  const roster = item.votes
    .filter((v) => v.round === item.round && v.voterId !== me.voterId)
    .map((v) => ({ voterId: v.voterId, voterName: v.voterName }));
  roster.push({ voterId: me.voterId, voterName: me.name });

  // Broadcast a DELTA, off the response path. Deliberately excludes the card
  // value: votes stay hidden until reveal, and this channel is visible to
  // every participant.
  waitUntil(
    pusher()
      .trigger(pokerChannel(params.code), POKER_EVENTS.voteUpdate, {
        itemId: item.id,
        round: item.round,
        voters: roster,
        votedCount: roster.length,
      })
      .catch(() => {})
  );

  return NextResponse.json({ ok: true });
}
