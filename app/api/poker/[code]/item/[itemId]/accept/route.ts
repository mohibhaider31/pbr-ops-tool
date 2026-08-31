export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { waitUntil } from "@vercel/functions";
import { prisma } from "@/lib/prisma";
import { getViewer } from "@/lib/viewer";
import { getSession } from "@/lib/session";
import { setStoryPoints, addJiraComment } from "@/lib/jira";
import { analyze } from "@/lib/poker";
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

  waitUntil(
    (async () => {
      try {
        const s = await getSession();
        const auth = s ? { accessToken: s.accessToken, cloudId: s.cloudId } : undefined;
        await setStoryPoints(item.jiraKey, points, auth);
        if (alignmentScore != null) {
          await addJiraComment(
            item.jiraKey,
            viewer.name,
            `Estimate accepted via Planning Poker: ${points} story points. Team alignment: ${alignmentScore}/5 (${analysis.spreadLabel}).`,
            auth
          );
        }
      } catch { /* non-fatal; score is safe in our DB, Jira sync can be retried */ }
    })()
  );

  return NextResponse.json({ ok: true, points, alignmentScore });
}
