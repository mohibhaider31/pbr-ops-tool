export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentBoard } from "@/lib/board";

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

  return NextResponse.json({ pending, failed, recentFailed });
}
