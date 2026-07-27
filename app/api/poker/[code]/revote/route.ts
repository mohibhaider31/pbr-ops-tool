export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getViewer } from "@/lib/viewer";
import { pusher, pokerChannel, POKER_EVENTS } from "@/lib/pusher-server";

export async function POST(_req: Request, { params }: { params: { code: string } }) {
  const viewer = await getViewer();
  if (!viewer) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const session = await prisma.pokerSession.findUnique({ where: { code: params.code } });
  if (!session) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (session.organizerId !== viewer.accountId)
    return NextResponse.json({ error: "only the organizer can re-vote" }, { status: 403 });

  await prisma.pokerSession.update({
    where: { id: session.id },
    data: { state: "VOTING", round: session.round + 1 },
  });
  await pusher().trigger(pokerChannel(session.code), POKER_EVENTS.reVote, { round: session.round + 1 });
  return NextResponse.json({ ok: true });
}
