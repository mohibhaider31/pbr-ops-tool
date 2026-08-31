// Durable outbox for Jira writes.
//
// Why this exists: waitUntil() got Jira off the response path, but it is not
// durable. If the call failed, our DB said "done" while Jira never received
// the write — no retry, no record, no way to notice. Jobs are now persisted,
// executed by a worker, and retried with backoff.
//
// Credentials: the worker runs outside any user request, so it has no OAuth
// token. jiraFetch() already falls back to the app-level JIRA_EMAIL /
// JIRA_API_TOKEN Basic auth when no auth is passed, which is what we rely on.
// Trade-off: retried comments are attributed to the API-token account rather
// than the individual, so we always embed the author's name in the comment
// body itself.

import { prisma } from "@/lib/prisma";
import { setStoryPoints, addJiraComment, transitionIssue } from "@/lib/jira";

export type OutboxType = "SET_STORY_POINTS" | "ADD_COMMENT" | "TRANSITION_ISSUE";

const BACKOFF_MS = [0, 15_000, 60_000, 300_000, 900_000]; // ~0s, 15s, 1m, 5m, 15m

/**
 * Build an enqueue operation to include in the SAME transaction as the local
 * write, so we never commit local state without also recording the intent to
 * sync it.
 */
export function enqueueOp(job: {
  boardId: string;
  type: OutboxType;
  jiraKey: string;
  payload: Record<string, unknown>;
}) {
  return prisma.outboxJob.create({
    data: {
      boardId: job.boardId,
      type: job.type,
      jiraKey: job.jiraKey,
      payload: job.payload as any,
    },
  });
}

/** Fire-and-forget enqueue when there's no surrounding transaction. */
export async function enqueue(job: {
  boardId: string;
  type: OutboxType;
  jiraKey: string;
  payload: Record<string, unknown>;
}) {
  return enqueueOp(job);
}

async function execute(job: { type: string; jiraKey: string; payload: any }) {
  switch (job.type) {
    case "SET_STORY_POINTS":
      await setStoryPoints(job.jiraKey, Number(job.payload.points));
      return;
    case "ADD_COMMENT":
      await addJiraComment(job.jiraKey, String(job.payload.author ?? "PBR Ops"), String(job.payload.text));
      return;
    case "TRANSITION_ISSUE":
      await transitionIssue(job.jiraKey, String(job.payload.to));
      return;
    default:
      throw new Error(`Unknown outbox job type: ${job.type}`);
  }
}

/**
 * Claim and run up to `limit` due jobs. Safe to call concurrently: each job is
 * claimed with a conditional update, so two workers won't run the same one.
 */
export async function runPending(limit = 10): Promise<{ ran: number; failed: number }> {
  let ran = 0;
  let failed = 0;

  const due = await prisma.outboxJob.findMany({
    where: { status: "PENDING", nextAttemptAt: { lte: new Date() } },
    orderBy: { nextAttemptAt: "asc" },
    take: limit,
    select: { id: true, type: true, jiraKey: true, payload: true, attempts: true, maxAttempts: true },
  });

  for (const job of due) {
    // Claim it. If another worker got there first, updateMany affects 0 rows.
    const claim = await prisma.outboxJob.updateMany({
      where: { id: job.id, status: "PENDING" },
      data: { status: "RUNNING", startedAt: new Date() },
    });
    if (claim.count === 0) continue;

    try {
      await execute(job);
      await prisma.outboxJob.update({
        where: { id: job.id },
        data: { status: "DONE", completedAt: new Date(), lastError: null },
      });
      ran++;
    } catch (err: any) {
      const attempts = job.attempts + 1;
      const exhausted = attempts >= job.maxAttempts;
      const delay = BACKOFF_MS[Math.min(attempts, BACKOFF_MS.length - 1)];
      await prisma.outboxJob.update({
        where: { id: job.id },
        data: {
          status: exhausted ? "FAILED" : "PENDING",
          attempts,
          lastError: String(err?.message || err).slice(0, 500),
          nextAttemptAt: new Date(Date.now() + delay),
        },
      });
      failed++;
    }
  }

  return { ran, failed };
}

/** Per-story sync status, so the UI can show SYNCING / SYNCED / FAILED. */
export async function syncStatusForKeys(boardId: string, jiraKeys: string[]) {
  if (jiraKeys.length === 0) return new Map<string, "SYNCING" | "FAILED">();
  const jobs = await prisma.outboxJob.findMany({
    where: { boardId, jiraKey: { in: jiraKeys }, status: { in: ["PENDING", "RUNNING", "FAILED"] } },
    select: { jiraKey: true, status: true },
  });
  const out = new Map<string, "SYNCING" | "FAILED">();
  for (const j of jobs) {
    // FAILED wins over SYNCING — a failure is what the user needs to see.
    if (j.status === "FAILED") out.set(j.jiraKey, "FAILED");
    else if (!out.has(j.jiraKey)) out.set(j.jiraKey, "SYNCING");
  }
  return out;
}
