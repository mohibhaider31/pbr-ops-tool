export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireCap } from "@/lib/guard";
import { getViewer } from "@/lib/viewer";
import { logAuthEvent, ipFrom } from "@/lib/authAudit";

// Board administration. Boards are how one deployment serves several products:
// access is per-person via BoardMembership, admins see everything.
//
// Listing is admin-only; ordinary users get their accessible boards through
// getAccessibleBoards() in the sidebar, which is already scoped to membership.
export async function GET() {
  const denied = await requireCap("manage_people");
  if (denied) return denied;

  const boards = await prisma.board.findMany({
    orderBy: [{ isDefault: "desc" }, { name: "asc" }],
    include: {
      _count: { select: { memberships: true } },
    },
  });

  // Story counts per board, so an admin can see which are actually in use.
  const storyCounts = await prisma.story.groupBy({
    by: ["boardId"],
    _count: { _all: true },
  });
  const byBoard = new Map(storyCounts.map((s) => [s.boardId, s._count._all]));

  return NextResponse.json({
    boards: boards.map((b) => ({
      id: b.id,
      name: b.name,
      jiraProjectKey: b.jiraProjectKey,
      backlogStatus: b.backlogStatus,
      readyForDevStatus: b.readyForDevStatus,
      pbrDonePath: b.pbrDonePath,
      isDefault: b.isDefault,
      memberCount: b._count.memberships,
      storyCount: byBoard.get(b.id) ?? 0,
      createdAt: b.createdAt,
    })),
  });
}

export async function POST(req: Request) {
  const denied = await requireCap("manage_people");
  if (denied) return denied;

  const body = await req.json();
  const name: string = (body.name ?? "").trim();
  const jiraProjectKey: string = (body.jiraProjectKey ?? "").trim().toUpperCase();

  if (!name || !jiraProjectKey)
    return NextResponse.json({ error: "Name and Jira project key are required" }, { status: 400 });
  if (!/^[A-Z][A-Z0-9_]{1,20}$/.test(jiraProjectKey))
    return NextResponse.json({ error: "That doesn't look like a Jira project key" }, { status: 400 });

  const clash = await prisma.board.findUnique({ where: { jiraProjectKey } });
  if (clash)
    return NextResponse.json(
      { error: `A board for ${jiraProjectKey} already exists ("${clash.name}")` },
      { status: 409 }
    );

  const viewer = await getViewer();
  const isFirst = (await prisma.board.count()) === 0;

  const board = await prisma.board.create({
    data: {
      name,
      jiraProjectKey,
      backlogStatus: (body.backlogStatus ?? "To Do").trim() || "To Do",
      readyForDevStatus: (body.readyForDevStatus ?? "Ready For Dev").trim() || "Ready For Dev",
      pbrDonePath: (body.pbrDonePath ?? "").trim(),
      isDefault: !!body.isDefault || isFirst,
    },
  });

  // Whoever creates it becomes PO on it, so it isn't born unreachable.
  if (viewer?.personId) {
    await prisma.boardMembership.create({
      data: { personId: viewer.personId, boardId: board.id, role: "PO" },
    });
  }

  // Only one default.
  if (board.isDefault) {
    await prisma.board.updateMany({
      where: { id: { not: board.id } },
      data: { isDefault: false },
    });
  }

  await logAuthEvent({
    kind: "LOGIN",
    actorName: viewer?.name ?? null,
    subject: jiraProjectKey,
    ip: ipFrom(req),
    detail: `board created: ${name}`,
  });

  return NextResponse.json({ ok: true, board });
}
