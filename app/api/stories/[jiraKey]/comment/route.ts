import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { addJiraComment } from "@/lib/jira";

export async function POST(
  req: Request,
  { params }: { params: { jiraKey: string } }
) {
  try {
    const { author, text, isQuestion, syncToJira }: {
      author: string;
      text: string;
      isQuestion?: boolean;
      syncToJira?: boolean;
    } = await req.json();

    const story = await prisma.story.findUnique({ where: { jiraKey: params.jiraKey } });
    if (!story) return NextResponse.json({ error: "Story not found" }, { status: 404 });

    const comment = await prisma.comment.create({
      data: { storyId: story.id, author, text, isQuestion: !!isQuestion },
    });

    if (syncToJira) {
      // Best-effort: don't fail the whole request if Jira comment sync hiccups.
      try {
        await addJiraComment(params.jiraKey, author, text);
      } catch (e) {
        console.error("Jira comment sync failed", e);
      }
    }

    return NextResponse.json({ comment });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
