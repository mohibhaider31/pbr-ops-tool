export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getViewer } from "@/lib/viewer";

const VALID_ROLES = ["PO", "BA", "DEVELOPER", "VIEWER"];

// Update role / admin flag. Admin only.
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const viewer = await getViewer();
  if (!viewer?.isAdmin) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const { role, isAdmin }: { role?: string; isAdmin?: boolean } = await req.json();
  if (role && !VALID_ROLES.includes(role))
    return NextResponse.json({ error: "Invalid role" }, { status: 400 });

  // Guardrail: don't let an admin remove their own admin (avoid locking
  // everyone out). They can demote others, not themselves.
  if (isAdmin === false) {
    const target = await prisma.person.findUnique({ where: { id: params.id } });
    if (target?.accountId && target.accountId === viewer.accountId) {
      return NextResponse.json({ error: "You can't remove your own admin access" }, { status: 400 });
    }
  }

  const person = await prisma.person.update({
    where: { id: params.id },
    data: {
      ...(role !== undefined ? { role: role as any } : {}),
      ...(isAdmin !== undefined ? { isAdmin } : {}),
    },
  });
  return NextResponse.json({ person });
}

// Remove a manually-added person. Admin only. (Jira-sourced people can be set
// to Viewer but not deleted, since they'd just re-sync.)
export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const viewer = await getViewer();
  if (!viewer?.isAdmin) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  await prisma.person.deleteMany({ where: { id: params.id, source: "manual" } });
  return NextResponse.json({ ok: true });
}
