export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const person = await prisma.person.findUnique({
    where: { accountId: session.accountId },
    select: { totpEnabledAt: true, totpBackupCodes: true },
  });
  return NextResponse.json({
    available: session.authType === "local",
    enabled: !!person?.totpEnabledAt,
    enabledAt: person?.totpEnabledAt ?? null,
    backupCodesRemaining: person?.totpBackupCodes.length ?? 0,
  });
}
