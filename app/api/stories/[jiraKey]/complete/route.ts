import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Called after the runner has walked the issue through every hop of the
// PBR-done chain. Only updates our local metadata - the actual Jira status
// changes already happened via the /transition endpoint, one hop at a time.
export async function POST(
  _req: Request,
  { params }: { params: { jiraKey: string } }
) {
  try {
    const story = await prisma.story.findUnique({ where: { jiraKey: params.jiraKey } });
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
