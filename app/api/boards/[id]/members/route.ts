export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireCap } from "@/lib/guard";
import type { BoardRole } from "@/lib/permissions";

const ROLES = ["PO", "BA", "DEVELOPER", "VIEWER"];

// Who can see this board. Access is per-person: a non-admin only ever sees
// boards they're a member of, so this list IS the access control.
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const denied = await requireCap("manage_people");
  if (denied) return denied;

  const [members, allPeople] = await Promise.all([
    prisma.boardMembership.findMany({
      where: { boardId: params.id },
      include: { person: { select: { id: true, name: true, email: true, avatarUrl: true, isAdmin: true, authType: true } } },
    }),
    prisma.person.findMany({
      where: { deactivatedAt: null },
      select: { id: true, name: true, email: true, avatarUrl: true },
      orderBy: { name: "asc" },
    }),
  ]);

  const memberIds = new Set(members.map((m) => m.personId));
  return NextResponse.json({
    members: members.map((m) => ({
      personId: m.personId,
      role: m.role,
      name: m.person.name,
      email: m.person.email,
      avatarUrl: m.person.avatarUrl,
      isAdmin: m.person.isAdmin,
      authType: m.person.authType,
    })),
    // Everyone not yet on this board, for the add picker.
    candidates: allPeople.filter((p) => !memberIds.has(p.id)),
  });
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const denied = await requireCap("manage_people");
  if (denied) return denied;

  const { personId, role }: { personId?: string; role?: BoardRole } = await req.json();
  if (!personId) return NextResponse.json({ error: "personId required" }, { status: 400 });
  const finalRole = ROLES.includes(role as string) ? (role as BoardRole) : "VIEWER";

  await prisma.boardMembership.upsert({
    where: { personId_boardId: { personId, boardId: params.id } },
    create: { personId, boardId: params.id, role: finalRole },
    update: { role: finalRole },
  });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  const denied = await requireCap("manage_people");
  if (denied) return denied;
  const { personId }: { personId?: string } = await req.json();
  if (!personId) return NextResponse.json({ error: "personId required" }, { status: 400 });

  await prisma.boardMembership.deleteMany({ where: { personId, boardId: params.id } });
  return NextResponse.json({ ok: true });
}
