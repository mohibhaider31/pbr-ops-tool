import { NextResponse } from "next/server";
import { fetchActiveStories } from "@/lib/jira";
import { prisma } from "@/lib/prisma";
import { LAYERS, emptyCells, deriveHandoff, type LayerCells, type Layer } from "@/lib/pipeline";

export async function GET() {
  try {
    const stories = await fetchActiveStories();
    const keys = stories.map((s) => s.key);

    const tracks = keys.length
      ? await prisma.layerTrack.findMany({ where: { jiraKey: { in: keys } } })
      : [];

    // Group layer rows by story key.
    const byKey = new Map<string, typeof tracks>();
    for (const t of tracks) {
      const arr = byKey.get(t.jiraKey) || [];
      arr.push(t);
      byKey.set(t.jiraKey, arr);
    }

    const rows = stories.map((story) => {
      const cells = emptyCells();
      const owners: Record<string, string | null> = {};
      const sprints: Record<string, string | null> = {};
      for (const t of byKey.get(story.key) || []) {
        cells[t.layer as Layer] = t.status as any;
        owners[t.layer] = t.owner;
        sprints[t.layer] = t.sprint;
      }
      return {
        jiraKey: story.key,
        summary: story.summary,
        jiraStatus: story.status,
        layers: LAYERS.map((layer) => ({
          layer,
          status: cells[layer],
          owner: owners[layer] ?? null,
          sprint: sprints[layer] ?? null,
        })),
        handoff: deriveHandoff(cells as LayerCells),
      };
    });

    return NextResponse.json({ rows });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
