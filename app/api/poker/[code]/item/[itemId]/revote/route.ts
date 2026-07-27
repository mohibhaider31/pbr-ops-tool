export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getViewer } from "@/lib/viewer";
import { pusher, pokerChannel, POKER_EVENTS } from "@/lib/pusher-server";

export async function POST(_req: Request, { params }: { params: { code: string; itemId: string } }) {
  const viewer = await getViewer();
  if (!viewer) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const session = await prisma.pokerSession.findUnique({ where: { code: params.code } });
  if (!session || session.organizerId !== viewer.accountId)
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const item = await prisma.pokerItem.findUnique({ where: { id: params.itemId } });
  if (!item) return NextResponse.json({ error: "not_found" }, { status: 404 });
  await prisma.pokerItem.update({
    where: { id: item.id },
    data: { state: "VOTING", round: item.round + 1 },
  });
  await pusher().trigger(pokerChannel(params.code), POKER_EVENTS.reVote, { itemId: item.id });
  return NextResponse.json({ ok: true });
}
