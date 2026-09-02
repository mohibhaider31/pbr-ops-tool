export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireCap } from "@/lib/guard";
import { getCurrentBoard } from "@/lib/board";
import { getViewer } from "@/lib/viewer";
import { localIssuesByKeys } from "@/lib/readModel";

const TERMINAL = ["done", "canceled", "cancelled", "frozen"];

// GET the board's roadmap.
//
// Reads ONLY our own Postgres: the entries/milestones are ours, and story
// status comes from the JiraIssue projection. That is what allows stakeholder
// accounts with no Atlassian licence (and no Jira permissions) to view it.
export async function GET() {
  const board = await getCurrentBoard();
  if (!board) return NextResponse.json({ error: "no board" }, { status: 400 });

  const [entries, milestones] = await Promise.all([
    prisma.roadmapEntry.findMany({
      where: { boardId: board.id },
      orderBy: [{ lane: "asc" }, { order: "asc" }, { targetDate: "asc" }],
    }),
    prisma.roadmapMilestone.findMany({
      where: { boardId: board.id },
      orderBy: { date: "asc" },
    }),
  ]);

  const issues = await localIssuesByKeys(board.id, entries.map((e) => e.jiraKey));
  const now = Date.now();

  const items = entries.map((e) => {
    const issue = issues.get(e.jiraKey);
    const status = issue?.status ?? null;
    const done = !!status && TERMINAL.includes(status.toLowerCase());
    // Overdue = target passed and Jira hasn't closed it. We flag rather than
    // silently move the date: an auto-shifted date hides the slip.
    const overdueDays = !done && e.targetDate.getTime() < now
      ? Math.floor((now - e.targetDate.getTime()) / 86_400_000)
      : 0;

    return {
      id: e.id,
      jiraKey: e.jiraKey,
      summary: issue?.summary ?? e.jiraKey,
      version: e.version,
      lane: e.lane,
      startDate: e.startDate,
      targetDate: e.targetDate,
      state: e.state, // CONFIRMED | TENTATIVE
      note: e.note,
      status,
      done,
      overdueDays,
      storyPoints: issue?.storyPoints ?? null,
    };
  });

  return NextResponse.json({
    board: { id: board.id, name: board.name },
    items,
    milestones,
    lanes: ["PRODUCT", "HOUSEKEEPING", "RESOURCE"],
  });
}

// Publish a story to the roadmap (or update it if already published).
export async function POST(req: Request) {
  const denied = await requireCap("roadmap_edit");
  if (denied) return denied;

  const board = await getCurrentBoard();
  if (!board) return NextResponse.json({ error: "no board" }, { status: 400 });

  const body = await req.json();
  const { jiraKey, startDate, targetDate, version, lane, state, note } = body ?? {};

  if (!jiraKey || !startDate || !targetDate)
    return NextResponse.json({ error: "jiraKey, startDate and targetDate are required" }, { status: 400 });

  const start = new Date(startDate);
  const target = new Date(targetDate);
  if (isNaN(start.getTime()) || isNaN(target.getTime()))
    return NextResponse.json({ error: "Invalid dates" }, { status: 400 });
  if (target < start)
    return NextResponse.json({ error: "Target date can't be before the start date" }, { status: 400 });

  const viewer = await getViewer();

  const entry = await prisma.roadmapEntry.upsert({
    where: { boardId_jiraKey: { boardId: board.id, jiraKey } },
    create: {
      boardId: board.id,
      jiraKey,
      startDate: start,
      targetDate: target,
      version: version || null,
      lane: lane || "PRODUCT",
      state: state === "TENTATIVE" ? "TENTATIVE" : "CONFIRMED",
      note: note || null,
      publishedBy: viewer?.name ?? null,
    },
    update: {
      startDate: start,
      targetDate: target,
      version: version || null,
      lane: lane || "PRODUCT",
      state: state === "TENTATIVE" ? "TENTATIVE" : "CONFIRMED",
      note: note || null,
    },
  });

  return NextResponse.json({ ok: true, entry });
}
