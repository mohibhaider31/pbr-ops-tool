import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { addJiraComment } from "@/lib/jira";
import { getSession } from "@/lib/session";
import { getCurrentBoard } from "@/lib/board";
import { requireCap } from "@/lib/guard";
import { waitUntil } from "@vercel/functions";

export async function POST(
  req: Request,
  { params }: { params: { jiraKey: string } }
) {
  const denied = await requireCap("review");
  if (denied) return denied;
  try {
    const board = await getCurrentBoard();
    if (!board) return NextResponse.json({ error: "no board" }, { status: 400 });
    const { text, isQuestion, syncToJira }: {
      text: string;
      isQuestion?: boolean;
      syncToJira?: boolean;
    } = await req.json();

    // Author now comes from the logged-in session, not the client. Falls back
    // to "Unknown" if somehow unauthenticated (routes are gated, but defensive).
    const session = await getSession();
    const author = session?.name || "Unknown";

    const story = await prisma.story.findFirst({ where: { jiraKey: params.jiraKey, boardId: board.id } });
    if (!story) return NextResponse.json({ error: "Story not found" }, { status: 404 });

    const comment = await prisma.comment.create({
      data: { storyId: story.id, author, text, isQuestion: !!isQuestion },
    });

    // Mirror to Jira in the background - the user should never wait on
    // Atlassian's API to see their own comment appear.
    if (syncToJira) {
      waitUntil(
        (async () => {
          try {
            const auth = session
              ? { accessToken: session.accessToken, cloudId: session.cloudId }
              : undefined;
            await addJiraComment(params.jiraKey, author, text, auth);
          } catch (e) {
            console.error("Jira comment sync failed", e);
          }
        })()
      );
    }

    // Return the whole updated story so the client can patch one row instead
    // of refetching the entire backlog.
    const updated = await prisma.story.findUnique({
      where: { id: story.id },
      include: { assignees: true, comments: { orderBy: { createdAt: "asc" } } },
    });

    return NextResponse.json({ comment, story: updated });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
