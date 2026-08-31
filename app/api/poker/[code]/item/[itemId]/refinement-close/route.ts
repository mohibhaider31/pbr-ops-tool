export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { waitUntil } from "@vercel/functions";
import { prisma } from "@/lib/prisma";
import { getViewer } from "@/lib/viewer";
import { getCurrentBoard } from "@/lib/board";
import { enqueueOp, runPending } from "@/lib/outbox";
import { pusher, pokerChannel, POKER_EVENTS } from "@/lib/pusher-server";

// Organizer closes the refinement poll. Tally: if >50% of votes say "needs
// refinement", increment the story's flag count. Re-discussion score = 5 minus
// flagCount, floored at 1. Snapshot onto the item and (best-effort) comment to
// Jira.
export async function POST(_req: Request, { params }: { params: { code: string; itemId: string } }) {
  const viewer = await getViewer();
  if (!viewer) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const session = await prisma.pokerSession.findUnique({ where: { code: params.code } });
  if (!session || session.organizerId !== viewer.accountId)
    return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const item = await prisma.pokerItem.findUnique({ where: { id: params.itemId } });
  if (!item) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const board = await getCurrentBoard();
  const boardId = board?.id || session.boardId;

  const votes = await prisma.refinementVote.findMany({ where: { itemId: item.id } });
  const total = votes.length;
  const yes = votes.filter((v) => v.needsWork).length;
  const majorityNeedsWork = total > 0 && yes / total > 0.5;

  // Update the story's cumulative flag count if the majority flagged it.
  let flagCount = 0;
  const existing = await prisma.storyRefinement.findUnique({
    where: { boardId_jiraKey: { boardId, jiraKey: item.jiraKey } },
  });
  flagCount = existing?.flagCount ?? 0;
  if (majorityNeedsWork) {
    const updated = await prisma.storyRefinement.upsert({
      where: { boardId_jiraKey: { boardId, jiraKey: item.jiraKey } },
      create: { boardId, jiraKey: item.jiraKey, flagCount: 1 },
      update: { flagCount: { increment: 1 } },
    });
    flagCount = updated.flagCount;
  }

  // Score: 5 minus flags, floored at 1. Never flagged → 5.
  const rediscussionScore = Math.max(1, 5 - flagCount);

  await prisma.pokerItem.update({
    where: { id: item.id },
    data: { refinementPollOpen: false, rediscussionScore, investPollOpen: true },
  });

  // Durable Jira note via the outbox.
  if (majorityNeedsWork) {
    await enqueueOp({
      boardId,
      type: "ADD_COMMENT",
      jiraKey: item.jiraKey,
      payload: {
        author: viewer.name,
        text: `Team flagged this story as still needing refinement (${yes}/${total} in Planning Poker). Re-discussion score: ${rediscussionScore}/5.`,
      },
    });
    waitUntil(runPending(5).then(() => {}).catch(() => {}));
  }

  waitUntil(pusher().trigger(pokerChannel(params.code), POKER_EVENTS.refinementClosed, {
    itemId: item.id, rediscussionScore, flagged: majorityNeedsWork, yes, total,
  }).catch(() => {}));
  // Chain straight into INVEST scoring.
  waitUntil(pusher().trigger(pokerChannel(params.code), POKER_EVENTS.investOpen, { itemId: item.id, jiraKey: item.jiraKey }).catch(() => {}));
  return NextResponse.json({ ok: true, rediscussionScore, flagged: majorityNeedsWork, yes, total });
}
