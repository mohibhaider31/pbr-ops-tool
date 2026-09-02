export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireCap } from "@/lib/guard";
import { getViewer } from "@/lib/viewer";
import { logAuthEvent, ipFrom } from "@/lib/authAudit";

// Suspend or restore access without deleting the person.
//
// Deleting loses their history — reviews, comments and poker votes all
// reference them — so revoking access needed to be a separate action.
// Deactivating also kills their live sessions immediately.
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const denied = await requireCap("manage_people");
  if (denied) return denied;

  const { active }: { active?: boolean } = await req.json().catch(() => ({}));
  const reactivating = active === true;

  const target = await prisma.person.findUnique({ where: { id: params.id } });
  if (!target) return NextResponse.json({ error: "Person not found" }, { status: 404 });

  const admin = await getViewer();
  if (!reactivating && admin?.accountId && target.accountId === admin.accountId)
    return NextResponse.json({ error: "You can't deactivate your own account" }, { status: 400 });

  await prisma.$transaction([
    prisma.person.update({
      where: { id: target.id },
      data: { deactivatedAt: reactivating ? null : new Date() },
    }),
    // Revoke live sessions so deactivation takes effect at once, not whenever
    // their cookie happens to expire.
    ...(reactivating
      ? []
      : [prisma.authSession.deleteMany({ where: { accountId: target.accountId ?? "" } })]),
  ]);

  await logAuthEvent({
    kind: reactivating ? "ACCOUNT_REACTIVATED" : "ACCOUNT_DEACTIVATED",
    actorName: admin?.name ?? null,
    subject: target.email ?? target.name,
    authType: target.authType,
    ip: ipFrom(req),
  });

  return NextResponse.json({ ok: true, active: reactivating });
}
