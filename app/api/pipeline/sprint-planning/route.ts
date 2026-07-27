export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { fetchActiveStories } from "@/lib/jira";
import { prisma } from "@/lib/prisma";
import {
  emptyCells,
  deriveOwedLayers,
  LAYER_LABEL,
  type LayerCells,
  type Layer,
} from "@/lib/pipeline";

// Sprint-planning view (PIPE-5): across pipeline members, find downstream
// layer work that is "owed" (upstream done, this layer not yet done) and
// group it by the owing layer. This is the carryover backlog each layer
// must pick up next sprint — the "what Engine finished that MW/FE still owe"
// question that motivated the tool.
export async function GET() {
  try {
    const members = await prisma.pipelineItem.findMany({ orderBy: { addedAt: "asc" } });
    const memberKeys = members.map((m) => m.jiraKey);
    if (memberKeys.length === 0)
      return NextResponse.json({ groups: [], totalOwed: 0 });

    const [stories, tracks] = await Promise.all([
      fetchActiveStories(),
      prisma.layerTrack.findMany({ where: { jiraKey: { in: memberKeys } } }),
    ]);
    const storyByKey = new Map(stories.map((s) => [s.key, s]));

    const tracksByKey = new Map<string, typeof tracks>();
    for (const t of tracks) {
      const arr = tracksByKey.get(t.jiraKey) || [];
      arr.push(t);
      tracksByKey.set(t.jiraKey, arr);
    }

    // owed items grouped by the owing layer
    const grouped: Record<Layer, any[]> = { ENGINE: [], MIDDLEWARE: [], FRONTEND: [] };
    let totalOwed = 0;

    for (const m of members) {
      const cells = emptyCells();
      const meta: Partial<Record<Layer, { doneAt: string | null; sprint: string | null }>> = {};
      for (const t of tracksByKey.get(m.jiraKey) || []) {
        cells[t.layer as Layer] = t.status as any;
        meta[t.layer as Layer] = {
          doneAt: t.doneAt ? t.doneAt.toISOString() : null,
          sprint: t.sprint ?? null,
        };
      }
      const owed = deriveOwedLayers(cells as LayerCells, meta);
      const story = storyByKey.get(m.jiraKey);
      for (const o of owed) {
        grouped[o.layer].push({
          jiraKey: m.jiraKey,
          summary: story?.summary ?? "(not in active Jira set)",
          status: o.status,
          upstreamDoneAt: o.upstreamDoneAt,
          upstreamSprint: o.upstreamSprint,
        });
        totalOwed++;
      }
    }

    // Order groups Engine -> MW -> FE; only include layers that owe something.
    const groups = (["MIDDLEWARE", "FRONTEND"] as Layer[])
      .map((layer) => ({
        layer,
        label: LAYER_LABEL[layer],
        items: grouped[layer].sort((a, b) => {
          // oldest upstream completion first (longest owed)
          const at = a.upstreamDoneAt || "";
          const bt = b.upstreamDoneAt || "";
          return at.localeCompare(bt);
        }),
      }))
      .filter((g) => g.items.length > 0);

    return NextResponse.json({ groups, totalOwed });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
