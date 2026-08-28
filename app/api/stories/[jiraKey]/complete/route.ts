import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireCap } from "@/lib/guard";
import { getCurrentBoard } from "@/lib/board";

// Called after the runner has walked the issue through every hop of the
// PBR-done chain. Only updates our local metadata - the actual Jira status
// changes already happened via the /transition endpoint, one hop at a time.
//
// Previously this had NO permission check at all: any authenticated session
// could mark any story PBR_DONE on any board. It now requires the same
// capability as the final approval hop, and is scoped to the current board.
export async function POST(
  _req: Request,
  { params }: { params: { jiraKey: string } }
) {
  const denied = await requireCap("pbr_approve");
  if (denied) return denied;
  try {
    const board = await getCurrentBoard();
    if (!board) return NextResponse.json({ error: "no board" }, { status: 400 });

    const story = await prisma.story.findFirst({
      where: { jiraKey: params.jiraKey, boardId: board.id },
    });
    if (!story) return NextResponse.json({ error: "Story not found" }, { status: 404 });

    await prisma.story.update({
      where: { id: story.id },
      data: { stage: "PBR_DONE", pbrDoneAt: new Date() },
    });

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
