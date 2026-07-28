export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { fetchBacklog } from "@/lib/jira";
import { prisma } from "@/lib/prisma";
import { getCurrentBoard } from "@/lib/board";

export async function GET() {
  try {
    const board = await getCurrentBoard();
    if (!board) return NextResponse.json({ error: "no board" }, { status: 400 });

    const issues = await fetchBacklog({ projectKey: board.jiraProjectKey, backlogStatus: board.backlogStatus });

    // Ensure every backlog issue has a Story row scoped to THIS board.
    const existing = await prisma.story.findMany({
      where: { boardId: board.id, jiraKey: { in: issues.map((i) => i.key) } },
    });
    const existingKeys = new Set(existing.map((s) => s.jiraKey));
    const maxOrder = existing.reduce((m, s) => Math.max(m, s.priorityOrder), 0);

    const newIssues = issues.filter((i) => !existingKeys.has(i.key));
    if (newIssues.length > 0) {
      await prisma.$transaction(
        newIssues.map((issue, idx) =>
          prisma.story.create({
            data: { boardId: board.id, jiraKey: issue.key, priorityOrder: maxOrder + idx + 1 },
          })
        )
      );
    }

    const stories = await prisma.story.findMany({
      where: { boardId: board.id, jiraKey: { in: issues.map((i) => i.key) } },
      include: { assignees: true, comments: { orderBy: { createdAt: "asc" } } },
      orderBy: { priorityOrder: "asc" },
    });

    const issueByKey = new Map(issues.map((i) => [i.key, i]));
    const merged = stories
      .filter((s) => issueByKey.has(s.jiraKey))
      .map((s) => ({ ...s, jira: issueByKey.get(s.jiraKey) }));

    return NextResponse.json({ stories: merged });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
