export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getViewer } from "@/lib/viewer";
import { can } from "@/lib/permissions";
import { generateCode } from "@/lib/poker";

// Create a poker session (a room). Stories are added afterwards to its queue.
export async function POST() {
  const viewer = await getViewer();
  if (!viewer) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!can({ role: viewer.role, isAdmin: viewer.isAdmin }, "poker_vote"))
    return NextResponse.json({ error: "forbidden" }, { status: 403 });

  // Opportunistic cleanup: remove sessions untouched for over 7 days so old
  // rooms don't accumulate. Cascades clear their items and votes. Runs here
  // (rather than a cron) since it's cheap and create is infrequent.
  try {
    const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    await prisma.pokerSession.deleteMany({ where: { updatedAt: { lt: cutoff } } });
  } catch {
    // non-fatal
  }

  let code = generateCode();
  for (let i = 0; i < 5; i++) {
    const clash = await prisma.pokerSession.findUnique({ where: { code } });
    if (!clash) break;
    code = generateCode();
  }
  const session = await prisma.pokerSession.create({
    data: { code, organizerId: viewer.accountId, organizerName: viewer.name },
  });
  return NextResponse.json({ code: session.code });
}
