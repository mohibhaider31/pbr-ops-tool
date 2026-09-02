export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getViewer } from "@/lib/viewer";
import { getCurrentBoard } from "@/lib/board";
import { localIssue } from "@/lib/readModel";

// Fetch one story in the drawer shape (local review data + fresh Jira fields).
// Used by My Work to open the StoryDrawer without loading the whole backlog.
export async function GET(_req: Request, { params }: { params: { jiraKey: string } }) {
  const viewer = await getViewer();
  if (!viewer) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const board = await getCurrentBoard();
  if (!board) return NextResponse.json({ error: "no board" }, { status: 400 });

  const jira = await localIssue(board.id, params.jiraKey);

  // Ensure a Story row exists (Jira-assigned stories may not be in the backlog).
  let story = await prisma.story.findUnique({
    where: { jiraKey: params.jiraKey },
    include: { assignees: true, comments: { orderBy: { createdAt: "asc" } } },
  });
  if (!story) {
    const maxOrder = await prisma.story.aggregate({ _max: { priorityOrder: true } });
    await prisma.story.create({
      data: { boardId: board.id, jiraKey: params.jiraKey, priorityOrder: (maxOrder._max.priorityOrder || 0) + 1 },
    });
    story = await prisma.story.findUnique({
      where: { jiraKey: params.jiraKey },
      include: { assignees: true, comments: { orderBy: { createdAt: "asc" } } },
    });
  }

  // Is this story roadmap-committed? Surfaced at PBR so a commitment made to
  // stakeholders actually influences what gets prioritised.
  const roadmap = await prisma.roadmapEntry.findUnique({
    where: { boardId_jiraKey: { boardId: board.id, jiraKey: params.jiraKey } },
    select: { targetDate: true, startDate: true, state: true, lane: true, version: true },
  });

  return NextResponse.json({ roadmap, story: { ...story, jira } });
}
