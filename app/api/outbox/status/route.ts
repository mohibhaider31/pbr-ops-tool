export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { waitUntil } from "@vercel/functions";
import { prisma } from "@/lib/prisma";
import { getCurrentBoard } from "@/lib/board";
import { runPending } from "@/lib/outbox";

// Outbox health, for the UI to surface unsynced / failed Jira writes rather
// than silently pretending everything reached Jira.
export async function GET() {
  const board = await getCurrentBoard();
  if (!board) return NextResponse.json({ error: "no board" }, { status: 400 });

  const [pending, failed, recentFailed] = await Promise.all([
    prisma.outboxJob.count({ where: { boardId: board.id, status: { in: ["PENDING", "RUNNING"] } } }),
    prisma.outboxJob.count({ where: { boardId: board.id, status: "FAILED" } }),
    prisma.outboxJob.findMany({
      where: { boardId: board.id, status: "FAILED" },
      orderBy: { updatedAt: "desc" },
      take: 10,
      select: { id: true, type: true, jiraKey: true, lastError: true, attempts: true, updatedAt: true },
    }),
  ]);

  // Opportunistic drain. Vercel's Hobby plan only permits a DAILY cron, which
  // is far too slow for retries, so we piggyback on this endpoint - the client
  // polls it every 30s while the app is open, which keeps the queue moving
  // whenever anyone is actually using the tool. The daily cron is a backstop
  // for jobs that failed while nobody was around.
  if (pending > 0) {
    waitUntil(runPending(10).then(() => {}).catch(() => {}));
  }

  return NextResponse.json({ pending, failed, recentFailed });
}
