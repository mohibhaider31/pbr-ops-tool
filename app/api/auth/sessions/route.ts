export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { logAuthEvent } from "@/lib/authAudit";

// Your own active sessions, and a way to end the others. Previously there was
// no way to revoke a session at all — a leaked cookie was good for 30 days.
export async function GET() {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const rows = await prisma.authSession.findMany({
    where: { accountId: s.accountId },
    orderBy: { createdAt: "desc" },
    select: { id: true, createdAt: true, expiresAt: true, authType: true },
  });
  return NextResponse.json({
    current: s.id,
    sessions: rows.map((r) => ({ ...r, isCurrent: r.id === s.id })),
  });
}

// Sign out everywhere except here.
export async function DELETE() {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const r = await prisma.authSession.deleteMany({
    where: { accountId: s.accountId, id: { not: s.id } },
  });
  await logAuthEvent({
    kind: "SESSIONS_REVOKED", actorName: s.name, actorId: s.accountId,
    subject: s.email, authType: s.authType, detail: `${r.count} revoked`,
  });
  return NextResponse.json({ ok: true, revoked: r.count });
}
