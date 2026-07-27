"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { avatarColor, initials } from "@/lib/avatar";
import Toast from "./Toast";
import AddStoriesModal from "./AddStoriesModal";

type LayerStatus = "NOT_STARTED" | "IN_PROGRESS" | "DONE" | "BLOCKED";
type Layer = "ENGINE" | "MIDDLEWARE" | "FRONTEND";

type LayerCell = { layer: Layer; status: LayerStatus; owner: string | null; sprint: string | null };
type Row = {
  jiraKey: string;
  summary: string;
  jiraStatus: string;
  layers: LayerCell[];
  handoff: string;
};

const LAYER_LABEL: Record<Layer, string> = {
  ENGINE: "Engine",
  MIDDLEWARE: "Middleware",
  FRONTEND: "Frontend",
};

const STATUS_ORDER: LayerStatus[] = ["NOT_STARTED", "IN_PROGRESS", "DONE", "BLOCKED"];
const STATUS_LABEL: Record<LayerStatus, string> = {
  NOT_STARTED: "—",
  IN_PROGRESS: "In progress",
  DONE: "Done",
  BLOCKED: "Blocked",
};
const STATUS_STYLE: Record<LayerStatus, string> = {
  NOT_STARTED: "bg-white border-border text-muted3",
  IN_PROGRESS: "bg-white border-key/40 text-key",
  DONE: "bg-white border-good/40 text-good",
  BLOCKED: "bg-white border-accent text-accent",
};

const HANDOFF_META: Record<string, { label: string; cls: string }> = {
  NOT_STARTED: { label: "Not started", cls: "text-muted3 border-border" },
  IN_ENGINE: { label: "In Engine", cls: "text-key border-key/40" },
  ENGINE_TO_MW: { label: "Engine → MW", cls: "text-key border-key/40" },
  MW_TO_FE: { label: "MW → FE", cls: "text-key border-key/40" },
  STALLED: { label: "Stalled", cls: "text-amberText border-amberBorder bg-amberBg" },
  BLOCKED: { label: "Blocked", cls: "text-accent border-accent" },
  SHIPPED: { label: "Shipped", cls: "text-good border-good/40" },
};

export default function PipelineBoard() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [onlyStalls, setOnlyStalls] = useState(false);
  const [addOpen, setAddOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/pipeline");
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setRows(data.rows);
      setError(null);
    } catch (e: any) {
      setError(e.message);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const showToast = (m: string) => {
    setToast(m);
    setTimeout(() => setToast(null), 2600);
  };

  const cycleStatus = async (row: Row, cell: LayerCell) => {
    const next = STATUS_ORDER[(STATUS_ORDER.indexOf(cell.status) + 1) % STATUS_ORDER.length];
    setRows(
      (prev) =>
        prev?.map((r) =>
          r.jiraKey === row.jiraKey
            ? { ...r, layers: r.layers.map((l) => (l.layer === cell.layer ? { ...l, status: next } : l)) }
            : r
        ) || prev
    );
    const res = await fetch(`/api/pipeline/${row.jiraKey}/${cell.layer}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: next }),
    });
    if (!res.ok) showToast("Update failed");
    load();
  };

  const setOwner = async (row: Row, cell: LayerCell) => {
    const owner = window.prompt(`Owner for ${row.jiraKey} · ${LAYER_LABEL[cell.layer]}`, cell.owner || "");
    if (owner === null) return;
    await fetch(`/api/pipeline/${row.jiraKey}/${cell.layer}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ owner: owner.trim() || null }),
    });
    load();
  };

  const setSprint = async (row: Row, cell: LayerCell) => {
    const sprint = window.prompt(
      `Sprint for ${row.jiraKey} · ${LAYER_LABEL[cell.layer]}\n(e.g. "Sprint 14" — shown as the sprint this layer's work completed in)`,
      cell.sprint || ""
    );
    if (sprint === null) return;
    await fetch(`/api/pipeline/${row.jiraKey}/${cell.layer}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sprint: sprint.trim() || null }),
    });
    load();
  };

  const removeMember = async (row: Row) => {
    if (!window.confirm(`Remove ${row.jiraKey} from the pipeline? Layer statuses are kept if you re-add it.`)) return;
    await fetch(`/api/pipeline/member/${row.jiraKey}`, { method: "DELETE" });
    showToast(`${row.jiraKey} removed from pipeline`);
    load();
  };

  const stats = useMemo(() => {
    const all = rows || [];
    const count = (h: string) => all.filter((r) => r.handoff === h).length;
    return { total: all.length, stalled: count("STALLED"), blocked: count("BLOCKED"), shipped: count("SHIPPED") };
  }, [rows]);

  const visible = useMemo(() => {
    if (!rows) return [];
    return onlyStalls ? rows.filter((r) => r.handoff === "STALLED" || r.handoff === "BLOCKED") : rows;
  }, [rows, onlyStalls]);

  if (error) {
    return (
      <div className="p-8">
        <div className="border border-amberBorder bg-amberBg p-4 text-sm text-amberTextDark">
          Couldn&apos;t load the pipeline: {error}
        </div>
      </div>
    );
  }
  if (!rows) return <div className="p-8 text-sm text-muted2 font-mono">Loading pipeline…</div>;

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <header className="flex items-end justify-between gap-6 px-[30px] pt-6 pb-4 border-b border-border">
        <div className="flex flex-col gap-[5px]">
          <h1 className="m-0 text-[25px] font-semibold tracking-[-0.025em]">Pipeline</h1>
          <p className="m-0 text-[12.5px] text-muted">
            Engine → Middleware → Frontend handoffs for stories you&apos;re tracking. Click a cell to advance it.
          </p>
        </div>
        <div className="flex items-center gap-[10px]">
          {rows.length > 0 && (
            <button
              onClick={() => setOnlyStalls((v) => !v)}
              className={`h-[38px] px-4 text-[13px] font-semibold border transition-colors ${
                onlyStalls ? "bg-accent text-white border-accent" : "bg-white text-muted border-border hover:border-ink"
              }`}
            >
              {onlyStalls ? "Showing needs-attention" : "Show needs-attention"}
            </button>
          )}
          <button
            onClick={() => setAddOpen(true)}
            className="h-[38px] px-4 text-[13px] font-semibold bg-ink text-white hover:bg-[#2E2B25] transition-colors"
          >
            + Add stories
          </button>
        </div>
      </header>

      {rows.length === 0 ? (
        <div className="flex-1 flex items-center justify-center p-8">
          <div className="border border-dashed border-border bg-cream px-8 py-10 flex flex-col items-center gap-3 max-w-[440px] text-center">
            <span className="text-[15px] font-semibold">No stories in the pipeline yet</span>
            <p className="m-0 text-[13px] text-muted leading-[1.55]">
              Add stories you&apos;re actively building across Engine, Middleware and Frontend. The tracker flags
              a handoff the moment one layer is done but the next hasn&apos;t started.
            </p>
            <button
              onClick={() => setAddOpen(true)}
              className="mt-1 h-[38px] px-4 text-[13px] font-semibold bg-accent text-white"
            >
              + Add your first stories
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-4 gap-px bg-border border-b border-border">
            {[
              { label: "TRACKED", value: stats.total, note: "in pipeline" },
              { label: "STALLED", value: stats.stalled, note: "handoff gap" },
              { label: "BLOCKED", value: stats.blocked, note: "needs unblock" },
              { label: "SHIPPED", value: stats.shipped, note: "all layers done" },
            ].map((s) => (
              <div key={s.label} className="bg-paper px-[30px] pt-[14px] pb-[15px] flex flex-col gap-[3px]">
                <span className="font-mono text-[10px] tracking-[.11em] text-muted2">{s.label}</span>
                <div className="flex items-baseline gap-[7px]">
                  <span
                    className={`text-[22px] font-semibold ${
                      s.label === "STALLED" && s.value > 0
                        ? "text-amberText"
                        : s.label === "BLOCKED" && s.value > 0
                        ? "text-accent"
                        : "text-ink"
                    }`}
                  >
                    {s.value}
                  </span>
                  <span className="text-[11.5px] text-muted2">{s.note}</span>
                </div>
              </div>
            ))}
          </div>

          <div className="flex-1 overflow-y-auto overflow-x-hidden">
            <div
              className="grid gap-0 px-[30px] items-center h-[34px] border-b border-borderLight sticky top-0 bg-paper z-[2]"
              style={{ gridTemplateColumns: "64px minmax(150px,1fr) 150px 150px 150px 120px 34px" }}
            >
              <span className="font-mono text-[9.5px] tracking-[.11em] text-muted3">KEY</span>
              <span className="font-mono text-[9.5px] tracking-[.11em] text-muted3 pr-3">SUMMARY</span>
              <span className="font-mono text-[9.5px] tracking-[.11em] text-muted3">ENGINE</span>
              <span className="font-mono text-[9.5px] tracking-[.11em] text-muted3">MIDDLEWARE</span>
              <span className="font-mono text-[9.5px] tracking-[.11em] text-muted3">FRONTEND</span>
              <span className="font-mono text-[9.5px] tracking-[.11em] text-muted3 text-right">HANDOFF</span>
              <span></span>
            </div>

            {visible.length === 0 && (
              <div className="p-8 text-sm text-muted2 text-center">Nothing stalled or blocked right now.</div>
            )}

            {visible.map((row) => {
              const meta = HANDOFF_META[row.handoff] || HANDOFF_META.NOT_STARTED;
              return (
                <div
                  key={row.jiraKey}
                  className="group grid gap-0 px-[30px] items-center min-h-[52px] py-2 border-b border-borderLight hover:bg-cream transition-colors"
                  style={{ gridTemplateColumns: "64px minmax(150px,1fr) 150px 150px 150px 120px 34px" }}
                >
                  <span className="font-mono text-[12px] font-medium text-key">{row.jiraKey}</span>
                  <div className="pr-3 min-w-0">
                    <div className="text-[13.5px] overflow-hidden text-ellipsis whitespace-nowrap">{row.summary}</div>
                    <div className="font-mono text-[10px] text-muted3">{row.jiraStatus}</div>
                  </div>
                  {row.layers.map((cell) => (
                    <div key={cell.layer} className="flex flex-col gap-1 pr-3">
                      <button
                        onClick={() => cycleStatus(row, cell)}
                        className={`h-[26px] px-2 border text-[11px] font-medium font-mono tracking-[.03em] text-left ${STATUS_STYLE[cell.status]}`}
                        title="Click to advance status"
                      >
                        {STATUS_LABEL[cell.status]}
                      </button>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setOwner(row, cell)}
                          className="flex items-center gap-1.5 text-[10px] text-muted2 hover:text-ink"
                        >
                          {cell.owner ? (
                            <>
                              <span
                                style={{ background: avatarColor(cell.owner) }}
                                className="w-[15px] h-[15px] rounded-full text-white text-[7.5px] font-mono font-semibold flex items-center justify-center"
                              >
                                {initials(cell.owner)}
                              </span>
                              {cell.owner}
                            </>
                          ) : (
                            <span className="text-muted3">+ owner</span>
                          )}
                        </button>
                        <button
                          onClick={() => setSprint(row, cell)}
                          title="Set sprint"
                          className="text-[10px] text-muted3 hover:text-ink font-mono"
                        >
                          {cell.sprint ? cell.sprint : "+ sprint"}
                        </button>
                      </div>
                    </div>
                  ))}
                  <div className="flex justify-end">
                    <span className={`font-mono text-[9.5px] tracking-[.08em] border px-[7px] py-[3px] ${meta.cls}`}>
                      {meta.label.toUpperCase()}
                    </span>
                  </div>
                  <button
                    onClick={() => removeMember(row)}
                    title="Remove from pipeline"
                    className="text-muted4 hover:text-accent text-[15px] opacity-0 group-hover:opacity-100 transition-opacity text-right"
                  >
                    ×
                  </button>
                </div>
              );
            })}
            <div className="px-[30px] py-[18px] pb-10">
              <span className="text-[12px] text-muted2">
                Cells cycle: — → In progress → Done → Blocked. Hover a row to remove it (layer statuses are kept).
              </span>
            </div>
          </div>
        </>
      )}

      {addOpen && (
        <AddStoriesModal
          onClose={() => setAddOpen(false)}
          onAdded={(n) => {
            setAddOpen(false);
            showToast(`Added ${n} ${n === 1 ? "story" : "stories"} to the pipeline`);
            load();
          }}
        />
      )}
      {toast && <Toast message={toast} />}
    </div>
  );
}
