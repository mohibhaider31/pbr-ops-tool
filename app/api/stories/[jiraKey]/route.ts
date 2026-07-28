export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getViewer } from "@/lib/viewer";
import { fetchIssue } from "@/lib/jira";
import { getCurrentBoard } from "@/lib/board";

// Fetch one story in the drawer shape (local review data + fresh Jira fields).
// Used by My Work to open the StoryDrawer without loading the whole backlog.
export async function GET(_req: Request, { params }: { params: { jiraKey: string } }) {
  const viewer = await getViewer();
  if (!viewer) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const board = await getCurrentBoard();
  if (!board) return NextResponse.json({ error: "no board" }, { status: 400 });

  const jira = await fetchIssue(params.jiraKey);

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

  return NextResponse.json({ story: { ...story, jira } });
}
