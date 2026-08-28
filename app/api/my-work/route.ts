export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getViewer } from "@/lib/viewer";
import { getSession } from "@/lib/session";
import { fetchMyJiraStories, fetchIssue, fetchMyMentions } from "@/lib/jira";
import { getCurrentBoard } from "@/lib/board";

// Personal worklist for the logged-in user. Combines:
//  - review assignments in this tool (matched by email), split into
//    "needs my review" vs "waiting on others"
//  - my open questions (questions I authored on any story)
//  - stories Jira-assigned to me (by accountId)
export async function GET() {
  const viewer = await getViewer();
  if (!viewer) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const board = await getCurrentBoard();
  if (!board) return NextResponse.json({ error: "no board" }, { status: 400 });

  const session = await getSession();
  const auth = session ? { accessToken: session.accessToken, cloudId: session.cloudId } : undefined;

  // --- Review assignments (this tool), matched by email ---
  const myEmail = viewer.email;
  const myAssignments = myEmail
    ? await prisma.assignee.findMany({
        where: { email: myEmail, story: { boardId: board.id } },
        include: {
          story: { include: { assignees: true, comments: true } },
        },
      })
    : [];

  const needsReview: any[] = [];
  const waitingOnOthers: any[] = [];
  for (const a of myAssignments) {
    const story = a.story;
    const total = story.assignees.length;
    const done = story.assignees.filter((x) => x.markedDone).length;
    const row = {
      jiraKey: story.jiraKey,
      stage: story.stage,
      myReviewDone: a.markedDone,
      reviewProgress: `${done}/${total}`,
      questionCount: story.comments.filter((c) => c.isQuestion).length,
    };
    if (!a.markedDone) needsReview.push(row);
    else if (done < total) waitingOnOthers.push(row);
  }

  // --- My open questions (questions I authored) ---
  const myQuestions = await prisma.comment.findMany({
    where: { isQuestion: true, author: viewer.name, story: { boardId: board.id } },
    include: { story: true },
    orderBy: { createdAt: "desc" },
  });
  const openQuestions = myQuestions.map((q) => ({
    jiraKey: q.story.jiraKey,
    text: q.text,
    createdAt: q.createdAt.toISOString(),
  }));

  // --- Jira-assigned to me (by accountId) ---
  let jiraAssigned: any[] = [];
  try {
    const stories = await fetchMyJiraStories(viewer.accountId, auth, { projectKey: board.jiraProjectKey });
    const doneStatuses = ["done", "closed", "resolved", "canceled", "cancelled", "frozen"];
    jiraAssigned = stories.map((s) => ({
      jiraKey: s.key,
      summary: s.summary,
      status: s.status,
      storyPoints: s.storyPoints,
      done: doneStatuses.includes((s.status || "").toLowerCase()),
    }));
  } catch (e) {
    // Non-fatal: if Jira lookup fails, still return the tool-side sections.
    jiraAssigned = [];
  }

  // Enrich review rows with a fresh summary from Jira (best-effort, cached per key).
  const summaryCache = new Map<string, string>();
  const enrich = async (rows: any[]) => {
    for (const r of rows) {
      if (summaryCache.has(r.jiraKey)) { r.summary = summaryCache.get(r.jiraKey); continue; }
      try {
        const issue = await fetchIssue(r.jiraKey);
        summaryCache.set(r.jiraKey, issue.summary);
        r.summary = issue.summary;
      } catch { r.summary = r.jiraKey; }
    }
  };
  await enrich(needsReview);
  await enrich(waitingOnOthers);

  // --- Jira comment @-mentions of me (minus ones I've dismissed) ---
  let mentions: any[] = [];
  try {
    const [found, dismissed] = await Promise.all([
      fetchMyMentions(viewer.accountId, auth, { projectKey: board.jiraProjectKey }),
      prisma.dismissedMention.findMany({ where: { accountId: viewer.accountId }, select: { commentId: true } }),
    ]);
    const dismissedIds = new Set(dismissed.map((d) => d.commentId));
    mentions = found.filter((m) => !dismissedIds.has(m.commentId));
  } catch {
    mentions = [];
  }

  return NextResponse.json({
    viewerName: viewer.name,
    needsReview,
    waitingOnOthers,
    openQuestions,
    jiraAssigned,
    mentions,
  });
}
