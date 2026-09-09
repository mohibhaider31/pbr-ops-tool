"use client";

import { useState } from "react";
import { useViewer } from "@/lib/useViewer";

// Backlog freshness pass. PO-only.
//
// Walks every Story in the project and nudges its description so Jira's
// `updated` timestamp refreshes. Runs in batches from the browser because 700+
// sequential Jira writes can't complete inside one serverless request — so the
// tab needs to stay open while it runs.

type Outcome = "appended" | "removed" | "created" | "skipped" | "failed";
type Result = { key: string; outcome: Outcome; error?: string };

export default function BacklogFreshnessPanel() {
  const { viewer } = useViewer();
  // Same gate as the API: PO or admin.
  const allowed = viewer?.isAdmin || viewer?.role === "PO";

  const [phase, setPhase] = useState<"idle" | "running" | "done">("idle");
  const [dryRun, setDryRun] = useState(true);
  const [total, setTotal] = useState(0);
  const [staleDays, setStaleDays] = useState(30);
  const [backlogTotal, setBacklogTotal] = useState<number | null>(null);
  const [done, setDone] = useState(0);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [failures, setFailures] = useState<Result[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [cancelled, setCancelled] = useState(false);

  if (!allowed) return null;

  const run = async () => {
    setPhase("running");
    setError(null);
    setDone(0);
    setCounts({});
    setFailures([]);
    setCancelled(false);

    try {
      const listRes = await fetch(`/api/admin/backlog-touch?staleDays=${staleDays}`);
      const list = await listRes.json();
      if (!listRes.ok) throw new Error(list.error || "Couldn't load the story list");

      const keys: string[] = list.keys ?? [];
      const size: number = list.batchSize ?? 20;
      setTotal(keys.length);
      setBacklogTotal(list.backlogTotal ?? null);

      const tally: Record<string, number> = {};
      const fails: Result[] = [];

      for (let i = 0; i < keys.length; i += size) {
        if (cancelled) break;
        const batch = keys.slice(i, i + size);
        const res = await fetch("/api/admin/backlog-touch", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ keys: batch, dryRun }),
        });
        const d = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(d.error || "Batch failed");

        for (const r of (d.results ?? []) as Result[]) {
          tally[r.outcome] = (tally[r.outcome] || 0) + 1;
          if (r.outcome === "failed") fails.push(r);
        }
        setCounts({ ...tally });
        setFailures([...fails]);
        setDone(Math.min(i + size, keys.length));
      }

      if (!dryRun) {
        const touched = (tally.appended || 0) + (tally.removed || 0) + (tally.created || 0);
        await fetch("/api/admin/backlog-touch", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ touched, failed: tally.failed || 0 }),
        }).catch(() => {});
      }

      setPhase("done");
    } catch (e: any) {
      setError(e.message);
      setPhase("done");
    }
  };

  const pct = total ? Math.round((done / total) * 100) : 0;
  const touched = (counts.appended || 0) + (counts.removed || 0) + (counts.created || 0);

  return (
    <div className="border border-borderLight bg-cream/30 p-4 flex flex-col gap-3">
      <div className="flex items-start gap-3">
        <div className="flex flex-col gap-1 flex-1">
          <span className="text-[13.5px] font-semibold">Backlog freshness pass</span>
          <p className="m-0 text-[12px] text-muted leading-[1.55]">
            Nudges backlog <strong>Stories with no activity in {staleDays} days</strong> — the
            ones the staleness metric counts — so their last-updated date refreshes. Tasks,
            sub-tasks, bugs and anything In Progress or Done are left alone. Watchers are notified
            of each edit, and this tab must stay open while it runs.
          </p>
        </div>
      </div>

      {phase === "idle" && (
        <>
          <div className="flex items-center gap-2 text-[12.5px] text-muted">
            <span>Stale after</span>
            <input
              type="number"
              min={0}
              max={365}
              value={staleDays}
              onChange={(e) => setStaleDays(Math.max(0, parseInt(e.target.value, 10) || 0))}
              className="w-[58px] h-[28px] px-2 border border-border text-[12.5px] text-center"
            />
            <span>days without activity</span>
            <span className="text-muted3">·</span>
            <span className="text-muted3">0 = whole backlog</span>
          </div>

          <label className="flex items-center gap-2 text-[12.5px] text-muted cursor-pointer">
            <input type="checkbox" checked={dryRun} onChange={(e) => setDryRun(e.target.checked)} />
            Dry run — count what would change without writing to Jira
          </label>
          <button
            onClick={run}
            className={`self-start h-[34px] px-4 text-[12.5px] font-semibold ${
              dryRun ? "border border-border hover:border-ink" : "bg-accent text-white"
            }`}
          >
            {dryRun ? "Preview" : "Run on all stories"}
          </button>
        </>
      )}

      {phase === "running" && (
        <div className="flex flex-col gap-2">
          <div className="h-[6px] bg-borderLight">
            <div className="h-full bg-ink transition-all" style={{ width: `${pct}%` }} />
          </div>
          <div className="flex items-center gap-3 font-mono text-[11px] text-muted2">
            <span>{done} / {total}</span>
            <span>{pct}%</span>
            {dryRun && <span className="text-key">DRY RUN</span>}
            <button
              onClick={() => setCancelled(true)}
              className="ml-auto text-[11px] text-muted3 hover:text-accent underline underline-offset-2"
            >
              Stop
            </button>
          </div>
        </div>
      )}

      {phase === "done" && (
        <div className="flex flex-col gap-2">
          {error && <span className="text-[12.5px] text-accent">{error}</span>}
          {backlogTotal != null && (
            <span className="text-[12px] text-muted2">
              {total} stale of {backlogTotal} backlog stories
              {staleDays > 0 ? ` (no activity in ${staleDays}+ days)` : ""}
            </span>
          )}
          <span className="text-[12.5px]">
            {dryRun ? "Preview complete — nothing was written. " : "Done. "}
            <strong>{touched}</strong> {dryRun ? "would be touched" : "stories touched"}
            {counts.skipped ? `, ${counts.skipped} skipped` : ""}
            {counts.failed ? `, ${counts.failed} failed` : ""}
            {cancelled ? " (stopped early)" : ""}
          </span>
          <div className="flex gap-3 font-mono text-[10.5px] text-muted3">
            {Object.entries(counts).map(([k, v]) => (
              <span key={k}>{k}: {v}</span>
            ))}
          </div>
          {failures.length > 0 && (
            <div className="border-l-2 border-accent pl-3 flex flex-col gap-1 max-h-[120px] overflow-y-auto">
              {failures.slice(0, 12).map((f) => (
                <span key={f.key} className="text-[11.5px] text-accent">
                  {f.key}: {f.error}
                </span>
              ))}
            </div>
          )}
          <button
            onClick={() => setPhase("idle")}
            className="self-start h-[30px] px-3 text-[12px] border border-border"
          >
            {dryRun ? "Back" : "Close"}
          </button>
        </div>
      )}
    </div>
  );
}
