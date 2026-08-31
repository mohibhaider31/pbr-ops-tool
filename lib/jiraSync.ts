// Jira → local read model synchronisation.
//
// Jira stays the system of record. This pulls issues into the JiraIssue
// projection so that Backlog, Pipeline, My Work, the poker picker and the
// story drawer can all be served from Postgres instead of blocking the user
// on Atlassian's API (which measured 0.5–1.2s per page, 7 pages for 675
// stories).
//
// Freshness strategy: reads always serve the local projection immediately. If
// the projection is older than STALE_AFTER_MS, the caller kicks a background
// refresh (via waitUntil) so the NEXT read is current. Nothing blocks.

import { prisma } from "@/lib/prisma";
import { fetchAllStories, type JiraAuth } from "@/lib/jira";

export const STALE_AFTER_MS = 5 * 60 * 1000;

// A sync that has been "running" longer than this is assumed dead (the
// serverless invocation was killed) and may be retried.
const SYNC_LOCK_TIMEOUT_MS = 2 * 60 * 1000;

export type SyncResult = { synced: number; skipped?: true; error?: string };

export async function getSyncState(boardId: string) {
  return prisma.jiraSyncState.findUnique({ where: { boardId } });
}

export async function isStale(boardId: string): Promise<boolean> {
  const state = await getSyncState(boardId);
  if (!state?.lastSyncAt) return true;
  return Date.now() - state.lastSyncAt.getTime() > STALE_AFTER_MS;
}

/**
 * Pull every story for a board from Jira and upsert into the projection.
 *
 * Uses one bulk INSERT ... ON CONFLICT rather than N Prisma upserts — with
 * ~675 issues, per-row upserts would be hundreds of round-trips and defeat
 * the point of the read model.
 */
export async function syncBoardIssues(
  boardId: string,
  projectKey: string,
  auth?: JiraAuth
): Promise<SyncResult> {
  // Take a lock so concurrent requests don't all sync at once.
  const existing = await prisma.jiraSyncState.findUnique({ where: { boardId } });
  const lockIsStale =
    existing?.syncing &&
    existing.updatedAt &&
    Date.now() - existing.updatedAt.getTime() > SYNC_LOCK_TIMEOUT_MS;
  if (existing?.syncing && !lockIsStale) return { synced: 0, skipped: true };

  await prisma.jiraSyncState.upsert({
    where: { boardId },
    create: { boardId, syncing: true },
    update: { syncing: true, lastError: null },
  });

  try {
    const issues = await fetchAllStories({ projectKey }, auth);

    if (issues.length > 0) {
      // Bulk upsert in chunks. Parameterised via Prisma.sql to stay injection-safe.
      const CHUNK = 200;
      for (let i = 0; i < issues.length; i += CHUNK) {
        const slice = issues.slice(i, i + CHUNK);
        const values = slice
          .map(
            (_, n) =>
              `($${n * 11 + 1}, $${n * 11 + 2}, $${n * 11 + 3}, $${n * 11 + 4}, $${n * 11 + 5}, $${n * 11 + 6}, $${n * 11 + 7}, $${n * 11 + 8}, $${n * 11 + 9}, $${n * 11 + 10}, $${n * 11 + 11}, NOW())`
          )
          .join(", ");
        const params: any[] = [];
        for (const it of slice) {
          params.push(
            `${boardId}:${it.key}`, // deterministic id so re-syncs don't churn rows
            boardId,
            it.key,
            it.summary ?? it.key,
            it.status ?? "Unknown",
            it.statusCategory ?? null,
            it.issueType ?? null,
            it.storyPoints ?? null,
            it.assigneeAccountId ?? null,
            it.assignee ?? null,
            it.labels ?? []
          );
        }
        await prisma.$executeRawUnsafe(
          `INSERT INTO "JiraIssue"
             ("id","boardId","jiraKey","summary","status","statusCategory","issueType","storyPoints","assigneeAccountId","assigneeName","labels","syncedAt")
           VALUES ${values}
           ON CONFLICT ("boardId","jiraKey") DO UPDATE SET
             "summary" = EXCLUDED."summary",
             "status" = EXCLUDED."status",
             "statusCategory" = EXCLUDED."statusCategory",
             "issueType" = EXCLUDED."issueType",
             "storyPoints" = EXCLUDED."storyPoints",
             "assigneeAccountId" = EXCLUDED."assigneeAccountId",
             "assigneeName" = EXCLUDED."assigneeName",
             "labels" = EXCLUDED."labels",
             "syncedAt" = NOW()`,
          ...params
        );
      }

      // Drop projection rows for issues that no longer exist in Jira.
      const liveKeys = issues.map((i) => i.key);
      await prisma.jiraIssue.deleteMany({
        where: { boardId, jiraKey: { notIn: liveKeys } },
      });
    }

    await prisma.jiraSyncState.update({
      where: { boardId },
      data: { syncing: false, lastSyncAt: new Date(), issueCount: issues.length, lastError: null },
    });
    return { synced: issues.length };
  } catch (err: any) {
    await prisma.jiraSyncState.update({
      where: { boardId },
      data: { syncing: false, lastError: String(err?.message || err).slice(0, 500) },
    });
    return { synced: 0, error: String(err?.message || err) };
  }
}
