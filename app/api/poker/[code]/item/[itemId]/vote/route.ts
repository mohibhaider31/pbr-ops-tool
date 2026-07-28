export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getViewer } from "@/lib/viewer";
import { can } from "@/lib/permissions";
import { getCurrentBoard } from "@/lib/board";
import { DECK } from "@/lib/poker";
import { pusher, pokerChannel, POKER_EVENTS } from "@/lib/pusher-server";

export async function POST(req: Request, { params }: { params: { code: string; itemId: string } }) {
  const viewer = await getViewer();
  if (!viewer) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const board = await getCurrentBoard();
  if (!can({ role: board?.role ?? "VIEWER", isAdmin: board?.isAdmin ?? false }, "poker_vote"))
    return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const { card }: { card: string } = await req.json();
  if (!DECK.includes(card)) return NextResponse.json({ error: "invalid card" }, { status: 400 });

  const item = await prisma.pokerItem.findUnique({ where: { id: params.itemId } });
  if (!item) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (item.state !== "VOTING") return NextResponse.json({ error: "voting closed" }, { status: 409 });

  await prisma.pokerVote.upsert({
    where: { itemId_round_voterId: { itemId: item.id, round: item.round, voterId: viewer.accountId } },
    create: { itemId: item.id, round: item.round, voterId: viewer.accountId, voterName: viewer.name, card },
    update: { card },
  });
  await pusher().trigger(pokerChannel(params.code), POKER_EVENTS.voteUpdate, { itemId: item.id });
  return NextResponse.json({ ok: true });
}
