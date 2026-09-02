export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { waitUntil } from "@vercel/functions";
import { prisma } from "@/lib/prisma";
import { getCurrentBoard } from "@/lib/board";
import { getJiraAuth } from "@/lib/session";
import {
  localAllStories,
  refreshIfStale,
  isProjectionEmpty,
} from "@/lib/readModel";
import { syncBoardIssues } from "@/lib/jiraSync";

// Backlog list — served entirely from the local read model.
//
// This used to call fetchAllStories(), which paged Jira 7 times for 675
// issues: ~6s on a cold cache, and Jira sat directly in the critical path of
// the most-used screen in the app. Now we read Postgres and refresh the
// projection in the background.
export async function GET() {
  try {
    const board = await getCurrentBoard();
    if (!board) return NextResponse.json({ error: "no board" }, { status: 400 });

    const auth = await getJiraAuth();

    // First ever load for this board: we have nothing to show, so populate
    // synchronously this once. Every subsequent load is served locally.
    if (await isProjectionEmpty(board.id)) {
      await syncBoardIssues(board.id, board.jiraProjectKey, auth);
    } else {
      // Serve now, self-heal after the response is sent.
      waitUntil(refreshIfStale(board.id, board.jiraProjectKey, auth));
    }

    const issues = await localAllStories(board.id);

    // Ensure every issue has a Story row (our operational metadata) for this board.
    const existing = await prisma.story.findMany({
      where: { boardId: board.id, jiraKey: { in: issues.map((i) => i.key) } },
      select: { jiraKey: true, priorityOrder: true },
    });
    const existingKeys = new Set(existing.map((s) => s.jiraKey));
    const maxOrder = existing.reduce((m, s) => Math.max(m, s.priorityOrder), 0);

    const newIssues = issues.filter((i) => !existingKeys.has(i.key));
    if (newIssues.length > 0) {
      await prisma.story.createMany({
        data: newIssues.map((issue, idx) => ({
          boardId: board.id,
          jiraKey: issue.key,
          priorityOrder: maxOrder + idx + 1,
        })),
        skipDuplicates: true,
      });
    }

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

    const statuses = Array.from(new Set(issues.map((i) => i.status))).sort();

    return NextResponse.json({ stories: merged, statuses });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
