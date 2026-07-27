import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { addJiraComment } from "@/lib/jira";
import { getSession } from "@/lib/session";

export async function POST(
  req: Request,
  { params }: { params: { jiraKey: string } }
) {
  try {
    const { text, isQuestion, syncToJira }: {
      text: string;
      isQuestion?: boolean;
      syncToJira?: boolean;
    } = await req.json();

    // Author now comes from the logged-in session, not the client. Falls back
    // to "Unknown" if somehow unauthenticated (routes are gated, but defensive).
    const session = await getSession();
    const author = session?.name || "Unknown";

    const story = await prisma.story.findUnique({ where: { jiraKey: params.jiraKey } });
    if (!story) return NextResponse.json({ error: "Story not found" }, { status: 404 });

    const comment = await prisma.comment.create({
      data: { storyId: story.id, author, text, isQuestion: !!isQuestion },
    });

    if (syncToJira) {
      // Mirror to Jira as the logged-in user (their token) when available.
      try {
        const auth = session
          ? { accessToken: session.accessToken, cloudId: session.cloudId }
          : undefined;
        await addJiraComment(params.jiraKey, author, text, auth);
      } catch (e) {
        console.error("Jira comment sync failed", e);
      }
    }

    return NextResponse.json({ comment });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
