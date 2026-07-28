export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getViewer } from "@/lib/viewer";
import { getCurrentBoard } from "@/lib/board";

const VALID_ROLES = ["PO", "BA", "DEVELOPER", "VIEWER"];

// Update a person's role on the CURRENT board (creates membership if needed),
// or toggle their global admin flag. Admin only.
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const viewer = await getViewer();
  if (!viewer?.isAdmin) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const board = await getCurrentBoard();
  if (!board) return NextResponse.json({ error: "no board" }, { status: 400 });

  const { role, isAdmin, removeFromBoard }: { role?: string; isAdmin?: boolean; removeFromBoard?: boolean } = await req.json();

  if (role && !VALID_ROLES.includes(role))
    return NextResponse.json({ error: "Invalid role" }, { status: 400 });

  // Guard: don't let an admin remove their own admin.
  if (isAdmin === false) {
    const target = await prisma.person.findUnique({ where: { id: params.id } });
    if (target?.accountId && target.accountId === viewer.accountId)
      return NextResponse.json({ error: "You can't remove your own admin access" }, { status: 400 });
  }

  if (isAdmin !== undefined) {
    await prisma.person.update({ where: { id: params.id }, data: { isAdmin } });
  }
  if (removeFromBoard) {
    await prisma.boardMembership.deleteMany({ where: { personId: params.id, boardId: board.id } });
  } else if (role !== undefined) {
    await prisma.boardMembership.upsert({
      where: { personId_boardId: { personId: params.id, boardId: board.id } },
      create: { personId: params.id, boardId: board.id, role: role as any },
      update: { role: role as any },
    });
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const viewer = await getViewer();
  if (!viewer?.isAdmin) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  await prisma.person.deleteMany({ where: { id: params.id, source: "manual" } });
  return NextResponse.json({ ok: true });
}
