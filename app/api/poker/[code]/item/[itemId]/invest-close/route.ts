export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { waitUntil } from "@vercel/functions";
import { prisma } from "@/lib/prisma";
import { getViewer } from "@/lib/viewer";
import { getSession } from "@/lib/session";
import { addJiraComment } from "@/lib/jira";
import { pusher, pokerChannel, POKER_EVENTS } from "@/lib/pusher-server";

// Organizer closes INVEST scoring. Score = average of each participant's 0-6
// total, out of 6. Also compute per-component agreement so we can show which
// criteria the team felt were weak.
export async function POST(_req: Request, { params }: { params: { code: string; itemId: string } }) {
  const viewer = await getViewer();
  if (!viewer) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const session = await prisma.pokerSession.findUnique({ where: { code: params.code } });
  if (!session || session.organizerId !== viewer.accountId)
    return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const item = await prisma.pokerItem.findUnique({ where: { id: params.itemId } });
  if (!item) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const votes = await prisma.investVote.findMany({ where: { itemId: item.id } });
  const n = votes.length;

  const perPersonTotal = (v: typeof votes[number]) =>
    [v.independent, v.negotiable, v.valuable, v.estimable, v.small, v.testable].filter(Boolean).length;

  const investScore = n > 0
    ? Math.round((votes.reduce((sum, v) => sum + perPersonTotal(v), 0) / n) * 100) / 100
    : 0;

  await prisma.pokerItem.update({
    where: { id: item.id },
    data: { investPollOpen: false, investScore },
  });

  // Broadcast the closed state and respond immediately. The Jira comment runs
  // in the background via waitUntil — reliably completes after the response is
  // sent, so the user never waits on Atlassian's slow API (was ~2.5s).
  waitUntil(pusher().trigger(pokerChannel(params.code), POKER_EVENTS.investClosed, { itemId: item.id, investScore, scorers: n }).catch(() => {}));

  waitUntil(
    (async () => {
      try {
        const s = await getSession();
        const auth = s ? { accessToken: s.accessToken, cloudId: s.cloudId } : undefined;
        await addJiraComment(
          item.jiraKey,
          viewer.name,
          `INVEST score (team average): ${investScore}/6, from ${n} scorer${n === 1 ? "" : "s"} in Planning Poker.`,
          auth
        );
      } catch { /* non-fatal */ }
    })()
  );

  return NextResponse.json({ ok: true, investScore, scorers: n });
}
