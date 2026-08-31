// Read-model accessors.
//
// Everything that used to call Jira synchronously to render a screen now goes
// through here. These are plain Postgres queries against the JiraIssue
// projection, so they cost one local round-trip instead of 0.9–6s of Atlassian
// API time.
//
// Callers should also call `refreshIfStale()` inside waitUntil() so the
// projection self-heals in the background without ever blocking a response.

import { prisma } from "@/lib/prisma";
import { isStale, syncBoardIssues } from "@/lib/jiraSync";
import type { JiraAuth } from "@/lib/jira";

// Shape the UI expects, matching the old lib/jira mapIssue output so call
// sites don't need reshaping.
export type ProjectedIssue = {
  key: string;
  summary: string;
  status: string;
  statusCategory: string | null;
  issueType: string;
  storyPoints: number | null;
  labels: string[];
  assignee: string | null;
  assigneeAccountId: string | null;
};

function toProjected(r: {
  jiraKey: string;
  summary: string;
  status: string;
  statusCategory: string | null;
  issueType: string | null;
  storyPoints: number | null;
  labels: string[];
  assigneeName: string | null;
  assigneeAccountId: string | null;
}): ProjectedIssue {
  return {
    key: r.jiraKey,
    summary: r.summary,
    status: r.status,
    statusCategory: r.statusCategory,
    issueType: r.issueType ?? "Story",
    storyPoints: r.storyPoints,
    labels: r.labels ?? [],
    assignee: r.assigneeName,
    assigneeAccountId: r.assigneeAccountId,
  };
}

const SELECT = {
  jiraKey: true,
  summary: true,
  status: true,
  statusCategory: true,
  issueType: true,
  storyPoints: true,
  labels: true,
  assigneeName: true,
  assigneeAccountId: true,
} as const;

/** Every projected issue for a board. Replaces fetchAllStories() on reads. */
export async function localAllStories(boardId: string): Promise<ProjectedIssue[]> {
  const rows = await prisma.jiraIssue.findMany({
    where: { boardId },
    select: SELECT,
    orderBy: { jiraKey: "asc" },
  });
  return rows.map(toProjected);
}

/** Issues in a specific status. Replaces fetchReadyForDevStories(). */
export async function localStoriesByStatus(
  boardId: string,
  status: string
): Promise<ProjectedIssue[]> {
  const rows = await prisma.jiraIssue.findMany({
    where: { boardId, status: { equals: status, mode: "insensitive" } },
    select: SELECT,
    orderBy: { jiraKey: "asc" },
  });
  return rows.map(toProjected);
}

/** Non-terminal issues. Replaces fetchActiveStories(). */
export async function localActiveStories(
  boardId: string,
  terminalStatuses: string[]
): Promise<ProjectedIssue[]> {
  const rows = await prisma.jiraIssue.findMany({
    where: {
      boardId,
      NOT: { status: { in: terminalStatuses, mode: "insensitive" } },
    },
    select: SELECT,
    orderBy: { jiraKey: "asc" },
  });
  return rows.map(toProjected);
}

/** Issues assigned to a person in Jira. Replaces fetchMyJiraStories(). */
export async function localStoriesAssignedTo(
  boardId: string,
  accountId: string
): Promise<ProjectedIssue[]> {
  const rows = await prisma.jiraIssue.findMany({
    where: { boardId, assigneeAccountId: accountId },
    select: SELECT,
    orderBy: { jiraKey: "asc" },
  });
  return rows.map(toProjected);
}

/** One issue. Replaces fetchIssue(). Returns null if not yet projected. */
export async function localIssue(
  boardId: string,
  jiraKey: string
): Promise<ProjectedIssue | null> {
  const row = await prisma.jiraIssue.findUnique({
    where: { boardId_jiraKey: { boardId, jiraKey } },
    select: SELECT,
  });
  return row ? toProjected(row) : null;
}

/** Many issues by key, as a map. Replaces fetchIssuesByKeys(). */
export async function localIssuesByKeys(
  boardId: string,
  keys: string[]
): Promise<Map<string, ProjectedIssue>> {
  if (keys.length === 0) return new Map();
  const rows = await prisma.jiraIssue.findMany({
    where: { boardId, jiraKey: { in: keys } },
    select: SELECT,
  });
  return new Map(rows.map((r) => [r.jiraKey, toProjected(r)]));
}

/**
 * Kick a sync only if the projection is stale. Intended to be passed to
 * waitUntil() so it runs after the response is sent.
 */
export async function refreshIfStale(
  boardId: string,
  projectKey: string,
  auth?: JiraAuth
): Promise<void> {
  try {
    if (await isStale(boardId)) {
      await syncBoardIssues(boardId, projectKey, auth);
    }
  } catch {
    // Never let a background refresh surface as a user-facing error.
  }
}

/** True when the projection has never been populated for this board. */
export async function isProjectionEmpty(boardId: string): Promise<boolean> {
  const n = await prisma.jiraIssue.count({ where: { boardId } });
  return n === 0;
}
