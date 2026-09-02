export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { waitUntil } from "@vercel/functions";
import { prisma } from "@/lib/prisma";
import { getViewer } from "@/lib/viewer";
import { getSession } from "@/lib/session";
import { analyze } from "@/lib/poker";
import { enqueueManyOp, runPending, type OutboxType } from "@/lib/outbox";
import { pusher, pokerChannel, POKER_EVENTS } from "@/lib/pusher-server";

export async function POST(req: Request, { params }: { params: { code: string; itemId: string } }) {
  const viewer = await getViewer();
  if (!viewer) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  // Accepting an estimate writes story points to Jira, so it needs a linked
  // Atlassian identity. Voting itself does not - that's our own data.
  const session = await getSession();
  if (session?.authType === "local")
    return NextResponse.json(
      { error: "Connect your Atlassian account to accept estimates", needsAtlassianLink: true },
      { status: 403 }
    );

  const { points }: { points: number } = await req.json();
  if (typeof points !== "number" || points < 0)
    return NextResponse.json({ error: "invalid points" }, { status: 400 });

  // ONE query for the item, its session and its votes. This previously took
  // three separate sequential round-trips (session, item, votes).
  const item = await prisma.pokerItem.findUnique({
    where: { id: params.itemId },
    include: { session: true, votes: true },
  });
  if (!item) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (item.session.code !== params.code)
    return NextResponse.json({ error: "wrong session" }, { status: 403 });
  if (item.session.organizerId !== viewer.accountId)
    return NextResponse.json({ error: "forbidden" }, { status: 403 });

  // Votes for the round being accepted (filtered in memory - a handful of rows).
  const roundVotes = item.votes.filter((v) => v.round === item.round);
  const analysis = analyze(
    roundVotes.map((v) => ({ voterId: v.voterId, voterName: v.voterName, card: v.card }))
  );
  const alignmentScore = analysis.alignmentScore;

  const jobs: { boardId: string; type: OutboxType; jiraKey: string; payload: Record<string, unknown> }[] = [
    {
      boardId: item.session.boardId,
      type: "SET_STORY_POINTS",
      jiraKey: item.jiraKey,
      payload: { points },
    },
  ];
  if (alignmentScore != null) {
    jobs.push({
      boardId: item.session.boardId,
      type: "ADD_COMMENT",
      jiraKey: item.jiraKey,
      payload: {
        author: viewer.name,
        text: `Estimate accepted via Planning Poker: ${points} story points. Team alignment: ${alignmentScore}/5 (${analysis.spreadLabel}).`,
      },
    });
  }

  // Local state change AND the intent to sync it to Jira commit together. If
  // these were separate (as before), the accept could persist while the outbox
  // job was lost - exactly the durability hole the outbox exists to close.
  // It's also one round-trip instead of two.
  await prisma.$transaction([
    prisma.pokerItem.update({
      where: { id: item.id },
      data: {
        finalPoints: points,
        alignmentScore: alignmentScore ?? undefined,
        status: "DONE",
        refinementPollOpen: true,
      },
    }),
    enqueueManyOp(jobs),
  ]);

  // Everything below is off the response path.
  waitUntil(
    Promise.allSettled([
      pusher().trigger(pokerChannel(params.code), POKER_EVENTS.accepted, {
        itemId: item.id,
        points,
        alignmentScore,
      }),
      pusher().trigger(pokerChannel(params.code), POKER_EVENTS.refinementOpen, {
        itemId: item.id,
        jiraKey: item.jiraKey,
      }),
      runPending(5),
    ]).then(() => {})
  );

  return NextResponse.json({ ok: true, points, alignmentScore });
}
