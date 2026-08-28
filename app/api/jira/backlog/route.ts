export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { fetchAllStories } from "@/lib/jira";
import { prisma } from "@/lib/prisma";
import { getCurrentBoard } from "@/lib/board";

export async function GET() {
  try {
    const board = await getCurrentBoard();
    if (!board) return NextResponse.json({ error: "no board" }, { status: 400 });

    const issues = await fetchAllStories({ projectKey: board.jiraProjectKey });

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

    // Projection, not the full object graph. The table renders assignee
    // avatars/counts and a question COUNT - it never renders comment bodies.
    // Previously every comment on every story was serialised and shipped.
    const stories = await prisma.story.findMany({
      where: { boardId: board.id, jiraKey: { in: issues.map((i) => i.key) } },
      select: {
        id: true,
        jiraKey: true,
        priorityOrder: true,
        stage: true,
        assignees: { select: { id: true, name: true, email: true, accountId: true, markedDone: true } },
        _count: { select: { comments: true } },
      },
      orderBy: { priorityOrder: "asc" },
    });

    // Question counts in one grouped query rather than shipping every comment.
    const questionCounts = await prisma.comment.groupBy({
      by: ["storyId"],
      where: { isQuestion: true, story: { boardId: board.id } },
      _count: { _all: true },
    });
    const qByStory = new Map(questionCounts.map((q) => [q.storyId, q._count._all]));

    const issueByKey = new Map(issues.map((i) => [i.key, i]));
    const merged = stories
      .filter((s) => issueByKey.has(s.jiraKey))
      .map((s) => ({
        id: s.id,
        jiraKey: s.jiraKey,
        priorityOrder: s.priorityOrder,
        stage: s.stage,
        assignees: s.assignees,
        commentCount: s._count.comments,
        questionCount: qByStory.get(s.id) ?? 0,
        jira: issueByKey.get(s.jiraKey),
      }));

    // Distinct statuses present, for the filter UI (in a stable order).
    const statuses = Array.from(new Set(issues.map((i) => i.status))).sort();

    return NextResponse.json({ stories: merged, statuses });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
