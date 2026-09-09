export const dynamic = "force-dynamic";
export const maxDuration = 60;

import { NextResponse } from "next/server";
import { getCurrentBoard } from "@/lib/board";
import { getSession, getJiraAuth } from "@/lib/session";
import { getViewer } from "@/lib/viewer";
import {
  fetchAllStories,
  fetchDescriptions,
  touchStoryDescription,
  type TouchOutcome,
} from "@/lib/jira";
import { logAuthEvent, ipFrom } from "@/lib/authAudit";

// Backlog freshness pass: nudges each STORY's description so Jira's `updated`
// timestamp refreshes.
//
// Deliberately chunked and client-driven. 700+ sequential Jira PUTs take
// minutes and cannot run inside one serverless invocation, so the client walks
// batches and shows progress.
//
// Story issue type only — fetchAllStories() filters on `issuetype = Story`, so
// tasks, sub-tasks and bugs are never touched.
//
// PO (or admin) only, and requires a linked Atlassian identity, since it writes
// to Jira under the caller's own token.

const MAX_BATCH = 20;

async function guard() {
  const [board, session, viewer] = await Promise.all([
    getCurrentBoard(),
    getSession(),
    getViewer(),
  ]);
  if (!board || !session || !viewer)
    return { error: NextResponse.json({ error: "unauthorized" }, { status: 401 }) };

  if (session.authType === "local")
    return {
      error: NextResponse.json(
        { error: "Connect your Atlassian account to run this", needsAtlassianLink: true },
        { status: 403 }
      ),
    };

  const allowed = board.isAdmin || board.role === "PO";
  if (!allowed)
    return {
      error: NextResponse.json({ error: "This is a PO-only action" }, { status: 403 }),
    };

  return { board, viewer };
}

// Step 1: the list of story keys to work through.
export async function GET() {
  const g = await guard();
  if ("error" in g) return g.error;

  const auth = await getJiraAuth();
  const stories = await fetchAllStories({ projectKey: g.board!.jiraProjectKey }, auth);
  return NextResponse.json({
    total: stories.length,
    keys: stories.map((s) => s.key),
    batchSize: MAX_BATCH,
  });
}

// Step 2: process one batch.
export async function POST(req: Request) {
  const g = await guard();
  if ("error" in g) return g.error;

  const { keys, dryRun }: { keys?: string[]; dryRun?: boolean } = await req.json();
  if (!Array.isArray(keys) || keys.length === 0)
    return NextResponse.json({ error: "keys required" }, { status: 400 });
  if (keys.length > MAX_BATCH)
    return NextResponse.json({ error: `Max ${MAX_BATCH} keys per batch` }, { status: 400 });

  const auth = await getJiraAuth();

  // One read for the whole batch, then one write per story.
  const descriptions = await fetchDescriptions(keys, auth);

  const results: { key: string; outcome: TouchOutcome; error?: string }[] = [];
  for (const key of keys) {
    try {
      const outcome = await touchStoryDescription(
        key,
        descriptions.get(key) ?? null,
        !!dryRun,
        auth
      );
      results.push({ key, outcome });
    } catch (err: any) {
      results.push({ key, outcome: "failed", error: String(err?.message || err).slice(0, 160) });
    }
  }

  return NextResponse.json({ results });
}

// Step 3: record that the pass happened, so it's not invisible later.
export async function PATCH(req: Request) {
  const g = await guard();
  if ("error" in g) return g.error;
  const { touched, failed }: { touched?: number; failed?: number } = await req.json();
  await logAuthEvent({
    kind: "LOGIN", // reusing the audit table; detail carries the meaning
    actorName: g.viewer!.name,
    actorId: g.viewer!.accountId,
    subject: g.board!.jiraProjectKey,
    ip: ipFrom(req),
    detail: `backlog freshness pass: ${touched ?? 0} stories touched, ${failed ?? 0} failed`,
  });
  return NextResponse.json({ ok: true });
}
