export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { fetchActiveStories } from "@/lib/jira";
import { prisma } from "@/lib/prisma";
import { getCurrentBoard } from "@/lib/board";

// Active (non-terminal) Jira stories not already in the pipeline — the
// candidate list for the "Add stories" picker.
export async function GET() {
  try {
    const board = await getCurrentBoard();
    if (!board) return NextResponse.json({ error: "no board" }, { status: 400 });
    const [stories, members] = await Promise.all([
      fetchActiveStories({ projectKey: board.jiraProjectKey }),
      prisma.pipelineItem.findMany({ where: { boardId: board.id }, select: { jiraKey: true } }),
    ]);
    const memberKeys = new Set(members.map((m) => m.jiraKey));
    const available = stories
      .filter((s) => !memberKeys.has(s.key))
      .map((s) => ({ jiraKey: s.key, summary: s.summary, jiraStatus: s.status }));
    return NextResponse.json({ available });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
