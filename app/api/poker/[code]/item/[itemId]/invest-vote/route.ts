export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { waitUntil } from "@vercel/functions";
import { prisma } from "@/lib/prisma";
import { getParticipant } from "@/lib/pokerParticipant";
import { pusher, pokerChannel, POKER_EVENTS } from "@/lib/pusher-server";

// Submit one person's INVEST scores: 0/1 for each of the 6 components. Open to
// everyone in the session including guests (full team members). Re-submittable
// while the poll is open.
export async function POST(req: Request, { params }: { params: { code: string; itemId: string } }) {
  const me = await getParticipant(params.code);
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const b = await req.json();
  const bool = (v: any) => v === true || v === 1;
  const scores = {
    independent: bool(b.independent),
    negotiable: bool(b.negotiable),
    valuable: bool(b.valuable),
    estimable: bool(b.estimable),
    small: bool(b.small),
    testable: bool(b.testable),
  };

  const item = await prisma.pokerItem.findUnique({
    where: { id: params.itemId },
    include: { investVotes: true },
  });
  if (!item) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (!item.investPollOpen) return NextResponse.json({ error: "poll closed" }, { status: 409 });

  await prisma.investVote.upsert({
    where: { itemId_voterId: { itemId: item.id, voterId: me.voterId } },
    create: { itemId: item.id, voterId: me.voterId, voterName: me.name, ...scores },
    update: scores,
  });
  // The INVEST results panel updates live, so the delta carries the rollup.
  // Rollup derived in memory from the votes we already loaded plus this one.
  const all = [
    ...item.investVotes.filter((v) => v.voterId !== me.voterId),
    { ...scores, voterId: me.voterId },
  ] as { independent: boolean; negotiable: boolean; valuable: boolean; estimable: boolean; small: boolean; testable: boolean }[];
  const rollup = [
    { key: "independent", ones: all.filter((v) => v.independent).length },
    { key: "negotiable", ones: all.filter((v) => v.negotiable).length },
    { key: "valuable", ones: all.filter((v) => v.valuable).length },
    { key: "estimable", ones: all.filter((v) => v.estimable).length },
    { key: "small", ones: all.filter((v) => v.small).length },
    { key: "testable", ones: all.filter((v) => v.testable).length },
  ];
  waitUntil(
    pusher()
      .trigger(pokerChannel(params.code), POKER_EVENTS.investUpdate, {
        itemId: item.id,
        submitted: all.length,
        rollup,
      })
      .catch(() => {})
  );
  return NextResponse.json({ ok: true });
}
