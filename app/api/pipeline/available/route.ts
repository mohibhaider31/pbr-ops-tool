export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { getCurrentBoard } from "@/lib/board";
import { localActiveStories } from "@/lib/readModel";

// Active (non-terminal) Jira stories not already in the pipeline — the
// candidate list for the "Add stories" picker.
export async function GET() {
  try {
    const board = await getCurrentBoard();
    if (!board) return NextResponse.json({ error: "no board" }, { status: 400 });
    const [stories, members] = await Promise.all([
      localActiveStories(board.id, ["Done", "Canceled", "Frozen"]),
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
