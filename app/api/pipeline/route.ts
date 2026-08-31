export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";

import { getCurrentBoard } from "@/lib/board";
import { prisma } from "@/lib/prisma";
import { LAYERS, emptyCells, deriveHandoff, type LayerCells, type Layer } from "@/lib/pipeline";
import { waitUntil } from "@vercel/functions";
import { localActiveStories, refreshIfStale } from "@/lib/readModel";

// Returns only stories explicitly added to the pipeline. Layer cells are
// joined in; handoff is derived. Jira is queried to get current summary/status
// for the member keys (so titles/statuses stay fresh).
export async function GET() {
  try {
    const board = await getCurrentBoard();
    if (!board) return NextResponse.json({ error: "no board" }, { status: 400 });
    const members = await prisma.pipelineItem.findMany({ where: { boardId: board.id }, orderBy: { addedAt: "asc" } });
    const memberKeys = new Set(members.map((m) => m.jiraKey));

    if (memberKeys.size === 0) return NextResponse.json({ rows: [] });

    // Pull active stories from Jira and index by key for fresh summary/status.
    // Served from the local read model; Jira refreshed in the background.
    waitUntil(refreshIfStale(board.id, board.jiraProjectKey, undefined));
    const stories = await localActiveStories(board.id, ["Done", "Canceled", "Frozen"]);
    const storyByKey = new Map(stories.map((s) => [s.key, s]));

    const tracks = await prisma.layerTrack.findMany({
      where: { boardId: board.id, jiraKey: { in: [...memberKeys] } },
    });
    const tracksByKey = new Map<string, typeof tracks>();
    for (const t of tracks) {
      const arr = tracksByKey.get(t.jiraKey) || [];
      arr.push(t);
      tracksByKey.set(t.jiraKey, arr);
    }

    const rows = members.map((m) => {
      const story = storyByKey.get(m.jiraKey);
      const cells = emptyCells();
      const owners: Record<string, string | null> = {};
      const sprints: Record<string, string | null> = {};
      const doneAts: Record<string, string | null> = {};
      for (const t of tracksByKey.get(m.jiraKey) || []) {
        cells[t.layer as Layer] = t.status as any;
        owners[t.layer] = t.owner;
        sprints[t.layer] = t.sprint;
        doneAts[t.layer] = t.doneAt ? t.doneAt.toISOString() : null;
      }
      return {
        jiraKey: m.jiraKey,
        // If a member story is no longer active in Jira (e.g. moved to Done),
        // we still show it but flag the missing live data.
        summary: story?.summary ?? "(not in active Jira set)",
        jiraStatus: story?.status ?? "—",
        layers: LAYERS.map((layer) => ({
          layer,
          status: cells[layer],
          owner: owners[layer] ?? null,
          sprint: sprints[layer] ?? null,
          doneAt: doneAts[layer] ?? null,
        })),
        handoff: deriveHandoff(cells as LayerCells),
      };
    });

    return NextResponse.json({ rows });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// Add one or more stories to the pipeline.
export async function POST(req: Request) {
  try {
    const board = await getCurrentBoard();
    if (!board) return NextResponse.json({ error: "no board" }, { status: 400 });
    const { jiraKeys }: { jiraKeys: string[] } = await req.json();
    if (!Array.isArray(jiraKeys) || jiraKeys.length === 0)
      return NextResponse.json({ error: "No keys provided" }, { status: 400 });

    await prisma.$transaction(
      jiraKeys.map((jiraKey) =>
        prisma.pipelineItem.upsert({
          where: { boardId_jiraKey: { boardId: board.id, jiraKey } },
          create: { boardId: board.id, jiraKey },
          update: {},
        })
      )
    );
    return NextResponse.json({ ok: true, added: jiraKeys.length });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
