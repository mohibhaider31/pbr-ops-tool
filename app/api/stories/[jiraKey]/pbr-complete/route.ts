export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireCap } from "@/lib/guard";
import { getCurrentBoard } from "@/lib/board";
import { getJiraAuth } from "@/lib/session";
import { transitionIssue } from "@/lib/jira";

// Server-owned PBR completion.
//
// The client Runner previously drove this hop by hop: for a 4-status path it
// made 4 separate calls to our API, and each of those made 2 Jira requests
// (fetch available transitions, then post) - 8 Jira round-trips plus 4 full
// auth cycles. The server already knows the path, so it owns the sequence now:
// ONE request from the browser.
//
// Deliberately synchronous rather than queued: each hop depends on the previous
// one, and we must not report "Ready For Dev" until Jira actually confirms it.
// The response reports exactly which hops succeeded, so the UI can tell the
// truth if it stops partway.
export async function POST(
  _req: Request,
  { params }: { params: { jiraKey: string } }
) {
  const denied = await requireCap("pbr_approve");
  if (denied) return denied;

  const board = await getCurrentBoard();
  if (!board) return NextResponse.json({ error: "no board" }, { status: 400 });

  const story = await prisma.story.findFirst({
    where: { jiraKey: params.jiraKey, boardId: board.id },
  });
  if (!story) return NextResponse.json({ error: "Story not found" }, { status: 404 });

  const auth = await getJiraAuth();

  const path = [...board.pbrDonePath];
  const completed: string[] = [];

  for (const target of path) {
    try {
      await transitionIssue(params.jiraKey, target, auth);
      completed.push(target);
    } catch (err: any) {
      // Stop at the first failure and report honestly how far we got.
      return NextResponse.json(
        {
          error: `Stopped at "${target}": ${err?.message || err}`,
          completed,
          remaining: path.slice(completed.length),
          partial: true,
        },
        { status: 502 }
      );
    }
  }

  // Only mark PBR done locally once Jira confirmed every hop.
  await prisma.story.update({
    where: { id: story.id },
    data: { stage: "PBR_DONE", pbrDoneAt: new Date() },
  });

  return NextResponse.json({ ok: true, completed });
}
