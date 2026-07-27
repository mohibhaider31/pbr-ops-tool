import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { transitionIssue } from "@/lib/jira";

// Target status name after a PBR discussion. Adjust to match your
// workflow's exact status name if it differs.
const READY_FOR_DEV_STATUS = process.env.JIRA_READY_FOR_DEV_STATUS || "Ready For Dev";

export async function POST(
  _req: Request,
  { params }: { params: { jiraKey: string } }
) {
  try {
    const story = await prisma.story.findUnique({ where: { jiraKey: params.jiraKey } });
    if (!story) return NextResponse.json({ error: "Story not found" }, { status: 404 });

    await transitionIssue(params.jiraKey, READY_FOR_DEV_STATUS);

    await prisma.story.update({
      where: { id: story.id },
      data: { stage: "PBR_DONE", pbrDoneAt: new Date() },
    });

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
