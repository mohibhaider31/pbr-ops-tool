import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Remove a story from the pipeline. Membership only — LayerTrack rows are
// intentionally left intact so re-adding resumes where it left off.
export async function DELETE(
  _req: Request,
  { params }: { params: { jiraKey: string } }
) {
  try {
    await prisma.pipelineItem.deleteMany({ where: { jiraKey: params.jiraKey } });
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
