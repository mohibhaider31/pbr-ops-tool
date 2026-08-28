export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getParticipant } from "@/lib/pokerParticipant";
import { pusher, pokerChannel, POKER_EVENTS } from "@/lib/pusher-server";

// Cast a "does this story still need refinement?" vote. Open to everyone in the
// session, including guests (their input on clarity is valuable). One vote per
// participant per item; changeable while the poll is open.
export async function POST(req: Request, { params }: { params: { code: string; itemId: string } }) {
  const me = await getParticipant(params.code);
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { needsWork }: { needsWork: boolean } = await req.json();
  if (typeof needsWork !== "boolean") return NextResponse.json({ error: "invalid" }, { status: 400 });

  const item = await prisma.pokerItem.findUnique({ where: { id: params.itemId } });
  if (!item) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (!item.refinementPollOpen) return NextResponse.json({ error: "poll closed" }, { status: 409 });

  await prisma.refinementVote.upsert({
    where: { itemId_voterId: { itemId: item.id, voterId: me.voterId } },
    create: { itemId: item.id, voterId: me.voterId, voterName: me.name, needsWork },
    update: { needsWork },
  });
  await pusher().trigger(pokerChannel(params.code), POKER_EVENTS.refinementUpdate, { itemId: item.id });
  return NextResponse.json({ ok: true });
}
