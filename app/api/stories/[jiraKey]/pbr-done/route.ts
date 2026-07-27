import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { transitionThroughPath } from "@/lib/jira";

// This workflow has no direct transition from the backlog status to
// Ready For Dev - it has to hop through several intermediate statuses
// in order. Confirmed with the PO as the real click-path used today.
// Override via JIRA_PBR_DONE_PATH (comma-separated) if the workflow changes.
const PBR_DONE_PATH = (
  process.env.JIRA_PBR_DONE_PATH ||
  "Requirement Analysis,Requirement Documentation,Pending PO Review,Ready For Dev"
)
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

export async function POST(
  _req: Request,
  { params }: { params: { jiraKey: string } }
) {
  try {
    const story = await prisma.story.findUnique({ where: { jiraKey: params.jiraKey } });
    if (!story) return NextResponse.json({ error: "Story not found" }, { status: 404 });

    await transitionThroughPath(params.jiraKey, PBR_DONE_PATH);

    await prisma.story.update({
      where: { id: story.id },
      data: { stage: "PBR_DONE", pbrDoneAt: new Date() },
    });

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
