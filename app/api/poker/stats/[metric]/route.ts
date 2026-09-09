export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentBoard } from "@/lib/board";
import { localIssuesByKeys } from "@/lib/readModel";

// Drill-down behind each stat card: which stories are actually counted.
//
// Reads our own tables and takes summaries from the JiraIssue projection, so
// opening a drill-down costs one local query rather than a Jira round-trip.
export async function GET(_req: Request, { params }: { params: { metric: string } }) {
  const board = await getCurrentBoard();
  if (!board) return NextResponse.json({ error: "no board" }, { status: 400 });

  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  type Row = { jiraKey: string; label: string; detail?: string };
  let rows: Row[] = [];
  let title = "";

  switch (params.metric) {
    case "estimated":
    case "points": {
      const items = await prisma.pokerItem.findMany({
        where: {
          session: { boardId: board.id },
          finalPoints: { not: null },
          updatedAt: { gte: monthStart },
        },
        orderBy: { updatedAt: "desc" },
        select: {
          jiraKey: true, finalPoints: true, round: true, alignmentScore: true,
          investScore: true, updatedAt: true, session: { select: { code: true } },
        },
      });
      title = params.metric === "points" ? "Points agreed this month" : "Estimated this month";
      rows = items.map((i) => ({
        jiraKey: i.jiraKey,
        label: `${i.finalPoints} pts`,
        detail: [
          i.round > 1 ? `${i.round} rounds` : null,
          i.alignmentScore != null ? `alignment ${i.alignmentScore}/5` : null,
          i.investScore != null ? `INVEST ${i.investScore}/6` : null,
          `session ${i.session.code}`,
        ].filter(Boolean).join(" · "),
      }));
      break;
    }

    case "rounds": {
      // The stories that took more than one round — the ones dragging the
      // average up, which is what you'd actually want to look at.
      const items = await prisma.pokerItem.findMany({
        where: {
          session: { boardId: board.id },
          finalPoints: { not: null },
          round: { gt: 1 },
          updatedAt: { gte: monthStart },
        },
        orderBy: { round: "desc" },
        select: { jiraKey: true, round: true, finalPoints: true, investScore: true },
      });
      title = "Stories that needed more than one round";
      rows = items.map((i) => ({
        jiraKey: i.jiraKey,
        label: `${i.round} rounds`,
        detail: [
          `${i.finalPoints} pts`,
          i.investScore != null ? `INVEST ${i.investScore}/6` : null,
        ].filter(Boolean).join(" · "),
      }));
      break;
    }

    case "flagged": {
      const flags = await prisma.storyRefinement.findMany({
        where: { boardId: board.id, flagCount: { gt: 0 } },
        orderBy: { flagCount: "desc" },
        select: { jiraKey: true, flagCount: true, updatedAt: true },
      });
      title = "Flagged for refinement";
      rows = flags.map((f) => ({
        jiraKey: f.jiraKey,
        label: `${f.flagCount}×`,
        detail: `re-discussion score ${Math.max(1, 5 - f.flagCount)}/5`,
      }));
      break;
    }

    default:
      return NextResponse.json({ error: "unknown metric" }, { status: 400 });
  }

  // Titles from the local projection — no Jira call.
  const issues = await localIssuesByKeys(board.id, rows.map((r) => r.jiraKey));

  return NextResponse.json({
    title,
    rows: rows.map((r) => ({ ...r, summary: issues.get(r.jiraKey)?.summary ?? r.jiraKey })),
  });
}
