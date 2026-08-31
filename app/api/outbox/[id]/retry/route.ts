export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { waitUntil } from "@vercel/functions";
import { prisma } from "@/lib/prisma";
import { getCurrentBoard } from "@/lib/board";
import { runPending } from "@/lib/outbox";

// Requeue a failed Jira write and immediately attempt it.
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const board = await getCurrentBoard();
  if (!board) return NextResponse.json({ error: "no board" }, { status: 400 });

  const updated = await prisma.outboxJob.updateMany({
    where: { id: params.id, boardId: board.id, status: "FAILED" },
    data: { status: "PENDING", attempts: 0, nextAttemptAt: new Date(), lastError: null },
  });
  if (updated.count === 0)
    return NextResponse.json({ error: "job not found or not failed" }, { status: 404 });

  waitUntil(runPending(5).then(() => {}).catch(() => {}));
  return NextResponse.json({ ok: true });
}
