export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireCap } from "@/lib/guard";
import { getViewer } from "@/lib/viewer";
import { logAuthEvent, ipFrom } from "@/lib/authAudit";

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const denied = await requireCap("manage_people");
  if (denied) return denied;

  const body = await req.json();
  const data: any = {};
  if (typeof body.name === "string" && body.name.trim()) data.name = body.name.trim();
  if (typeof body.backlogStatus === "string") data.backlogStatus = body.backlogStatus.trim();
  if (typeof body.readyForDevStatus === "string") data.readyForDevStatus = body.readyForDevStatus.trim();
  if (typeof body.pbrDonePath === "string") data.pbrDonePath = body.pbrDonePath.trim();
  if (typeof body.isDefault === "boolean") data.isDefault = body.isDefault;

  // The Jira project key is deliberately NOT editable: Story, JiraIssue and
  // RoadmapEntry rows are all keyed to this board's project. Repointing it
  // would orphan every one of them.

  const board = await prisma.board.update({ where: { id: params.id }, data });

  if (data.isDefault) {
    await prisma.board.updateMany({ where: { id: { not: board.id } }, data: { isDefault: false } });
  }

  return NextResponse.json({ ok: true, board });
}

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  const denied = await requireCap("manage_people");
  if (denied) return denied;

  const board = await prisma.board.findUnique({ where: { id: params.id } });
  if (!board) return NextResponse.json({ error: "Board not found" }, { status: 404 });

  // Refuse to delete a board carrying real work — the operational metadata
  // (priorities, reviews, comments, poker history, roadmap) is not recoverable
  // from Jira.
  const [stories, roadmap, sessions] = await Promise.all([
    prisma.story.count({ where: { boardId: board.id } }),
    prisma.roadmapEntry.count({ where: { boardId: board.id } }),
    prisma.pokerSession.count({ where: { boardId: board.id } }),
  ]);
  if (stories + roadmap + sessions > 0)
    return NextResponse.json(
      {
        error: `This board has ${stories} stories, ${roadmap} roadmap items and ${sessions} poker sessions. Remove them first, or keep the board.`,
      },
      { status: 409 }
    );

  if (await prisma.board.count() === 1)
    return NextResponse.json({ error: "You can't delete the only board" }, { status: 409 });

  await prisma.$transaction([
    prisma.boardMembership.deleteMany({ where: { boardId: board.id } }),
    prisma.board.delete({ where: { id: board.id } }),
  ]);

  const viewer = await getViewer();
  await logAuthEvent({
    kind: "LOGIN", actorName: viewer?.name ?? null, subject: board.jiraProjectKey,
    ip: ipFrom(req), detail: `board deleted: ${board.name}`,
  });
  return NextResponse.json({ ok: true });
}
