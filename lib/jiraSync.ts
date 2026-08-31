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
      // Replace the board's projection atomically. Two statements inside one
      // transaction (a DELETE and a single multi-row INSERT) rather than a
      // raw ON CONFLICT upsert - Prisma handles the text[]/float typing
      // correctly, and readers see either the old snapshot or the new one,
      // never a partial state.
      await prisma.$transaction([
        prisma.jiraIssue.deleteMany({ where: { boardId } }),
        prisma.jiraIssue.createMany({
          data: issues.map((it) => ({
            boardId,
            jiraKey: it.key,
            summary: it.summary ?? it.key,
            status: it.status ?? "Unknown",
            statusCategory: it.statusCategory ?? null,
            issueType: it.issueType ?? null,
            storyPoints:
              typeof it.storyPoints === "number"
                ? it.storyPoints
                : it.storyPoints != null
                  ? Number(it.storyPoints) || null
                  : null,
            assigneeAccountId: it.assigneeAccountId ?? null,
            assigneeName: it.assignee ?? null,
            labels: it.labels ?? [],
          })),
          skipDuplicates: true,
        }),
      ]);
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
