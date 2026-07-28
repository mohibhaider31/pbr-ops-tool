export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getViewer } from "@/lib/viewer";
import { getCurrentBoard } from "@/lib/board";
import { deriveHandoff, emptyCells, type LayerCells, type Layer } from "@/lib/pipeline";

// Admin dashboard aggregates. Admin only.
export async function GET() {
  const viewer = await getViewer();
  if (!viewer) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!viewer.isAdmin) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const board = await getCurrentBoard();
  if (!board) return NextResponse.json({ error: "no board" }, { status: 400 });
  const B = board.id;

  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const [
    people,
    activePeople,
    storiesInReview,
    pbrDoneTotal,
    pbrDoneWeek,
    openQuestions,
    pipelineItems,
    tracks,
    pokerSessions,
    pokerDoneItems,
  ] = await Promise.all([
    prisma.person.count(),
    prisma.person.count({ where: { firstLoginAt: { not: null } } }),
    prisma.story.count({ where: { boardId: B, stage: "IN_REVIEW" } }),
    prisma.story.count({ where: { boardId: B, stage: "PBR_DONE" } }),
    prisma.story.count({ where: { boardId: B, stage: "PBR_DONE", pbrDoneAt: { gte: weekAgo } } }),
    prisma.comment.count({ where: { isQuestion: true, story: { boardId: B } } }),
    prisma.pipelineItem.findMany({ where: { boardId: B } }),
    prisma.layerTrack.findMany({ where: { boardId: B } }),
    prisma.pokerSession.count({ where: { boardId: B } }),
    prisma.pokerItem.count({ where: { status: "DONE", session: { boardId: B } } }),
  ]);

  // Pipeline handoff health
  const tracksByKey = new Map<string, typeof tracks>();
  for (const t of tracks) {
    const arr = tracksByKey.get(t.jiraKey) || [];
    arr.push(t);
    tracksByKey.set(t.jiraKey, arr);
  }
  const handoffCounts: Record<string, number> = {};
  for (const m of pipelineItems) {
    const cells = emptyCells();
    for (const t of tracksByKey.get(m.jiraKey) || []) cells[t.layer as Layer] = t.status as any;
    const h = deriveHandoff(cells as LayerCells);
    handoffCounts[h] = (handoffCounts[h] || 0) + 1;
  }

  // People needing onboarding (invited, never logged in)
  const invited = await prisma.person.findMany({
    where: { firstLoginAt: null },
    select: { name: true, email: true },
    orderBy: { createdAt: "desc" },
    take: 8,
  });

  // Recently PBR-done stories
  const recentDone = await prisma.story.findMany({
    where: { boardId: B, stage: "PBR_DONE", pbrDoneAt: { not: null } },
    select: { jiraKey: true, pbrDoneAt: true },
    orderBy: { pbrDoneAt: "desc" },
    take: 6,
  });

  // Reviewer load: who has the most open (not-done) review assignments
  const openAssignments = await prisma.assignee.findMany({
    where: { markedDone: false, story: { boardId: B } },
    select: { name: true },
  });
  const loadMap = new Map<string, number>();
  for (const a of openAssignments) loadMap.set(a.name, (loadMap.get(a.name) || 0) + 1);
  const reviewerLoad = [...loadMap.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 6);

  return NextResponse.json({
    people: { total: people, active: activePeople, invited: people - activePeople },
    pbr: { inReview: storiesInReview, doneTotal: pbrDoneTotal, doneThisWeek: pbrDoneWeek, openQuestions },
    pipeline: { tracked: pipelineItems.length, handoff: handoffCounts },
    poker: { sessions: pokerSessions, estimatedItems: pokerDoneItems },
    invited,
    recentDone: recentDone.map((s) => ({ jiraKey: s.jiraKey, at: s.pbrDoneAt?.toISOString() })),
    reviewerLoad,
  });
}
