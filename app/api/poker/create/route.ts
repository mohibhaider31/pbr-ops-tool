export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getViewer } from "@/lib/viewer";
import { getSession } from "@/lib/session";
import { can } from "@/lib/permissions";
import { generateCode } from "@/lib/poker";
import { getCurrentBoard } from "@/lib/board";

// Create a poker session (a room). Stories are added afterwards to its queue.
export async function POST() {
  const viewer = await getViewer();
  if (!viewer) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const board = await getCurrentBoard();
  if (!board) return NextResponse.json({ error: "no board" }, { status: 400 });
  // poker_vote touches only our own data, so an unlinked account is fine here —
  // but pass authType anyway so this call site behaves consistently if the
  // capability table ever changes.
  const sess = await getSession();
  if (!can({ role: board.role ?? "VIEWER", isAdmin: board.isAdmin, authType: sess?.authType }, "poker_vote"))
    return NextResponse.json({ error: "forbidden" }, { status: 403 });

  // Opportunistic cleanup: remove sessions untouched for over 7 days so old
  // rooms don't accumulate. Cascades clear their items and votes. Runs here
  // (rather than a cron) since it's cheap and create is infrequent.
  try {
    const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    // Close out abandoned sessions rather than deleting them — the estimation
    // history is worth keeping even when nobody formally ended the session.
    // Scoped to THIS board. Without the filter, starting a session on one
    // product silently closed abandoned sessions on every other product.
    await prisma.pokerSession.updateMany({
      where: { boardId: board.id, updatedAt: { lt: cutoff }, endedAt: null },
      data: { endedAt: new Date(), currentItemId: null },
    });
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
    data: { code, boardId: board.id, organizerId: viewer.accountId, organizerName: viewer.name },
  });
  return NextResponse.json({ code: session.code });
}
