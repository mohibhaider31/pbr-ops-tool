import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentBoard } from "@/lib/board";

// Remove a story from the pipeline. Membership only — LayerTrack rows are
// intentionally left intact so re-adding resumes where it left off.
export async function DELETE(
  _req: Request,
  { params }: { params: { jiraKey: string } }
) {
  try {
    const board = await getCurrentBoard();
    if (!board) return NextResponse.json({ error: "no board" }, { status: 400 });
    await prisma.pipelineItem.deleteMany({ where: { boardId: board.id, jiraKey: params.jiraKey } });
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
