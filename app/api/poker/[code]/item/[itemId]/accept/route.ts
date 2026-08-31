export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { waitUntil } from "@vercel/functions";
import { prisma } from "@/lib/prisma";
import { getViewer } from "@/lib/viewer";

import { analyze } from "@/lib/poker";
import { enqueueOp, runPending } from "@/lib/outbox";
import { pusher, pokerChannel, POKER_EVENTS } from "@/lib/pusher-server";

export async function POST(req: Request, { params }: { params: { code: string; itemId: string } }) {
  const viewer = await getViewer();
  if (!viewer) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const session = await prisma.pokerSession.findUnique({ where: { code: params.code } });
  if (!session || session.organizerId !== viewer.accountId)
    return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const { points }: { points: number } = await req.json();
  if (typeof points !== "number" || points < 0)
    return NextResponse.json({ error: "invalid points" }, { status: 400 });

  const item = await prisma.pokerItem.findUnique({ where: { id: params.itemId } });
  if (!item) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const votes = await prisma.pokerVote.findMany({ where: { itemId: item.id, round: item.round } });
  const analysis = analyze(votes.map((v) => ({ voterId: v.voterId, voterName: v.voterName, card: v.card })));
  const alignmentScore = analysis.alignmentScore;

  // Record in our (fast, co-located) DB and broadcast immediately, then open
  // the refinement poll. All the Jira work happens in the background via
  // waitUntil so the organizer's accept feels instant instead of waiting on
  // Atlassian's API (was ~4.7s).
  await prisma.pokerItem.update({
    where: { id: item.id },
    data: { finalPoints: points, alignmentScore: alignmentScore ?? undefined, status: "DONE", refinementPollOpen: true },
  });
  waitUntil(pusher().trigger(pokerChannel(params.code), POKER_EVENTS.accepted, { itemId: item.id, points, alignmentScore }).catch(() => {}));
  waitUntil(pusher().trigger(pokerChannel(params.code), POKER_EVENTS.refinementOpen, { itemId: item.id, jiraKey: item.jiraKey }).catch(() => {}));

  // Durable: enqueue the Jira writes instead of firing them into waitUntil.
  // If Jira is briefly unavailable the worker retries with backoff, rather
  // than our DB claiming success for a write Jira never received.
  await prisma.$transaction([
    enqueueOp({
      boardId: session.boardId,
      type: "SET_STORY_POINTS",
      jiraKey: item.jiraKey,
      payload: { points },
    }),
    ...(alignmentScore != null
      ? [
          enqueueOp({
            boardId: session.boardId,
            type: "ADD_COMMENT",
            jiraKey: item.jiraKey,
            payload: {
              author: viewer.name,
              text: `Estimate accepted via Planning Poker: ${points} story points. Team alignment: ${alignmentScore}/5 (${analysis.spreadLabel}).`,
            },
          }),
        ]
      : []),
  ]);

  // Try to drain immediately so the write usually lands within seconds.
  waitUntil(runPending(5).then(() => {}).catch(() => {}));

  return NextResponse.json({ ok: true, points, alignmentScore });
}
