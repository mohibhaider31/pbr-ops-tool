export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentBoard } from "@/lib/board";

// Poker landing: live session, headline stats, recent sessions.
//
// Served entirely from our own Postgres — no Jira call. Summaries come from the
// JiraIssue projection, so this page stays fast regardless of Atlassian.
export async function GET() {
  const board = await getCurrentBoard();
  if (!board) return NextResponse.json({ error: "no board" }, { status: 400 });

  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  const [live, accepted, flagged, sessions] = await Promise.all([
    // A session is live while it hasn't been ended.
    prisma.pokerSession.findFirst({
      where: { boardId: board.id, endedAt: null },
      orderBy: { createdAt: "desc" },
      include: { items: { select: { id: true, jiraKey: true, summary: true, status: true } } },
    }),
    // Everything estimated this month, for the three estimation stats.
    prisma.pokerItem.findMany({
      where: {
        session: { boardId: board.id },
        finalPoints: { not: null },
        updatedAt: { gte: monthStart },
      },
      select: { jiraKey: true, finalPoints: true, round: true },
    }),
    prisma.storyRefinement.findMany({
      where: { boardId: board.id, flagCount: { gt: 0 } },
      select: { jiraKey: true, flagCount: true },
      orderBy: { flagCount: "desc" },
    }),
    prisma.pokerSession.findMany({
      where: { boardId: board.id },
      orderBy: { createdAt: "desc" },
      take: 8,
      include: {
        items: { select: { jiraKey: true, finalPoints: true, round: true, status: true } },
      },
    }),
  ]);

  const pointsAgreed = accepted.reduce((sum, i) => sum + (i.finalPoints ?? 0), 0);
  const avgRounds = accepted.length
    ? Math.round((accepted.reduce((s, i) => s + i.round, 0) / accepted.length) * 10) / 10
    : null;

  // Sync state per session, straight from the outbox — "SYNCED" vs "N PENDING"
  // is real data, not decoration.
  const allKeys = sessions.flatMap((s) => s.items.map((i) => i.jiraKey));
  const outbox = allKeys.length
    ? await prisma.outboxJob.findMany({
        where: { boardId: board.id, jiraKey: { in: allKeys }, status: { in: ["PENDING", "RUNNING", "FAILED"] } },
        select: { jiraKey: true, status: true },
      })
    : [];
  const unsynced = new Map<string, string>();
  for (const j of outbox) {
    if (j.status === "FAILED") unsynced.set(j.jiraKey, "FAILED");
    else if (!unsynced.has(j.jiraKey)) unsynced.set(j.jiraKey, "PENDING");
  }

  // Current story summary for the live banner.
  const liveCurrent = live?.items.find((i) => i.id === live.currentItemId) ?? null;

  return NextResponse.json({
    live: live
      ? {
          code: live.code,
          organizerName: live.organizerName,
          startedAt: live.createdAt,
          currentKey: liveCurrent?.jiraKey ?? null,
          currentSummary: liveCurrent?.summary ?? null,
          done: live.items.filter((i) => i.status === "DONE").length,
          total: live.items.length,
        }
      : null,
    stats: {
      estimatedThisMonth: accepted.length,
      pointsAgreed: Math.round(pointsAgreed * 100) / 100,
      avgRounds,
      flaggedForRefinement: flagged.length,
    },
    sessions: sessions.map((s) => {
      const done = s.items.filter((i) => i.finalPoints != null);
      const pending = s.items.filter((i) => unsynced.get(i.jiraKey) === "PENDING").length;
      const failed = s.items.filter((i) => unsynced.get(i.jiraKey) === "FAILED").length;
      return {
        code: s.code,
        when: s.createdAt,
        endedAt: s.endedAt,
        organizerName: s.organizerName,
        stories: s.items.length,
        points: Math.round(done.reduce((sum, i) => sum + (i.finalPoints ?? 0), 0) * 100) / 100,
        avgRounds: done.length
          ? Math.round((done.reduce((sum, i) => sum + i.round, 0) / done.length) * 10) / 10
          : null,
        sync: failed > 0 ? `${failed} failed` : pending > 0 ? `${pending} pending` : "synced",
      };
    }),
  });
}
