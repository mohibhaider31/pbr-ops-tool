export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
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

  // Compute the Alignment Spread Score from the votes on the round being
  // accepted (item.round = current/final round). Reuses the same spread logic
  // shown at reveal, so the number matches what the team just saw.
  const votes = await prisma.pokerVote.findMany({
    where: { itemId: item.id, round: item.round },
  });
  const analysis = analyze(votes.map((v) => ({ voterId: v.voterId, voterName: v.voterName, card: v.card })));
  const alignmentScore = analysis.alignmentScore; // 1-5 or null

  try {
    const s = await getSession();
    const auth = s ? { accessToken: s.accessToken, cloudId: s.cloudId } : undefined;

    await setStoryPoints(item.jiraKey, points, auth);

    // Push the alignment score to Jira as a comment alongside points (no custom
    // field required). Best-effort — a comment failure shouldn't block accept.
    if (alignmentScore != null) {
      try {
        await addJiraComment(
          item.jiraKey,
          viewer.name,
          `Estimate accepted via Planning Poker: ${points} story points. Team alignment: ${alignmentScore}/5 (${analysis.spreadLabel}).`,
          auth
        );
      } catch { /* non-fatal */ }
    }

    await prisma.pokerItem.update({
      where: { id: item.id },
      data: { finalPoints: points, alignmentScore: alignmentScore ?? undefined, status: "DONE", refinementPollOpen: true },
    });
    await pusher().trigger(pokerChannel(params.code), POKER_EVENTS.accepted, { itemId: item.id, points, alignmentScore });
    // Kick off the post-accept "does this still need refinement?" poll.
    await pusher().trigger(pokerChannel(params.code), POKER_EVENTS.refinementOpen, { itemId: item.id, jiraKey: item.jiraKey });
    return NextResponse.json({ ok: true, points, alignmentScore });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
