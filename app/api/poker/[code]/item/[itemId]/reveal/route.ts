export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { waitUntil } from "@vercel/functions";
import { prisma } from "@/lib/prisma";
import { getViewer } from "@/lib/viewer";
import { analyze } from "@/lib/poker";
import { pusher, pokerChannel, POKER_EVENTS } from "@/lib/pusher-server";

export async function POST(_req: Request, { params }: { params: { code: string; itemId: string } }) {
  const viewer = await getViewer();
  if (!viewer) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const session = await prisma.pokerSession.findUnique({ where: { code: params.code } });
  if (!session || session.organizerId !== viewer.accountId)
    return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const item = await prisma.pokerItem.update({
    where: { id: params.itemId },
    data: { state: "REVEALED" },
  });

  // Reveal is the moment cards become public, so the delta can now carry the
  // actual votes plus the computed analysis. Clients render straight from this
  // instead of each re-downloading the whole session.
  const votes = await prisma.pokerVote.findMany({
    where: { itemId: item.id, round: item.round },
    select: { voterId: true, voterName: true, card: true },
  });
  const analysis = analyze(votes);

  waitUntil(
    pusher()
      .trigger(pokerChannel(params.code), POKER_EVENTS.revealed, {
        itemId: item.id,
        round: item.round,
        participants: votes.map((v) => ({
          voterId: v.voterId,
          voterName: v.voterName,
          voted: true,
          card: v.card,
        })),
        analysis,
      })
      .catch(() => {})
  );

  return NextResponse.json({ ok: true, analysis });
}
