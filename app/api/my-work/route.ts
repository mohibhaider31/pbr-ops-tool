export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getViewer } from "@/lib/viewer";
import { getSession } from "@/lib/session";
import { fetchMyJiraStories, fetchIssuesByKeys } from "@/lib/jira";
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
  // Match on the stable accountId first; fall back to email for rows created
  // before accountId was stored.
  const myEmail = viewer.email;
  const myAssignments = (viewer.accountId || myEmail)
    ? await prisma.assignee.findMany({
        where: {
          story: { boardId: board.id },
          OR: [
            ...(viewer.accountId ? [{ accountId: viewer.accountId }] : []),
            ...(myEmail ? [{ email: myEmail }] : []),
          ],
        },
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

  // Enrich review rows with fresh summaries. This was a sequential N+1: one
  // Jira HTTP request per row. Now a single batched JQL call for every key.
  const keys = [...needsReview, ...waitingOnOthers].map((r) => r.jiraKey);
  const issueByKey = await fetchIssuesByKeys(keys, auth);
  for (const r of [...needsReview, ...waitingOnOthers]) {
    r.summary = issueByKey.get(r.jiraKey)?.summary ?? r.jiraKey;
  }

  // Mentions are NOT fetched here - they cost 1 search + up to 40 Jira comment
  // requests. The client loads /api/my-work/mentions separately so this page
  // can render as soon as the local data is ready.

  return NextResponse.json({
    viewerName: viewer.name,
    needsReview,
    waitingOnOthers,
    openQuestions,
    jiraAssigned,
  });
}
