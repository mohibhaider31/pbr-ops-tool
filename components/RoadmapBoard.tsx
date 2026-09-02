"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useViewer } from "@/lib/useViewer";
import Toast from "./Toast";

type Item = {
  id: string;
  jiraKey: string;
  summary: string;
  version: string | null;
  lane: string;
  startDate: string;
  targetDate: string;
  state: "CONFIRMED" | "TENTATIVE";
  note: string | null;
  status: string | null;
  done: boolean;
  overdueDays: number;
  storyPoints: number | null;
};
type Milestone = { id: string; label: string; date: string; kind: string };
type Data = { board: { id: string; name: string }; items: Item[]; milestones: Milestone[]; lanes: string[] };

const LANE_LABEL: Record<string, string> = {
  PRODUCT: "Product",
  HOUSEKEEPING: "House Keeping",
  RESOURCE: "Resource",
};
const MS_DAY = 86_400_000;

// Month columns spanning the data (padded), so the timeline always frames what
// actually exists rather than a fixed window.
function useMonths(items: Item[], milestones: Milestone[]) {
  return useMemo(() => {
    const dates: number[] = [];
    for (const i of items) {
      dates.push(new Date(i.startDate).getTime(), new Date(i.targetDate).getTime());
    }
    for (const m of milestones) dates.push(new Date(m.date).getTime());
    dates.push(Date.now());

    const min = new Date(Math.min(...dates));
    const max = new Date(Math.max(...dates));
    const start = new Date(min.getFullYear(), min.getMonth() - 1, 1);
    const end = new Date(max.getFullYear(), max.getMonth() + 2, 1);

    const months: { label: string; start: number; end: number }[] = [];
    const cur = new Date(start);
    while (cur < end) {
      const next = new Date(cur.getFullYear(), cur.getMonth() + 1, 1);
      months.push({
        label: cur.toLocaleString("en", { month: "short" }).toUpperCase() + " " + cur.getFullYear(),
        start: cur.getTime(),
        end: next.getTime(),
      });
      cur.setMonth(cur.getMonth() + 1);
    }
    return { months, spanStart: start.getTime(), spanEnd: end.getTime() };
  }, [items, milestones]);
}

export default function RoadmapBoard() {
  const { can } = useViewer();
  const editable = can("roadmap_edit");

  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [addMilestoneOpen, setAddMilestoneOpen] = useState(false);

  const showToast = (m: string) => { setToast(m); setTimeout(() => setToast(null), 2600); };

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/roadmap");
      const d = await res.json();
      if (d.error) throw new Error(d.error);
      setData(d);
    } catch (e: any) {
      setError(e.message);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const items = data?.items ?? [];
  const milestones = data?.milestones ?? [];
  const { months, spanStart, spanEnd } = useMonths(items, milestones);
  const totalMs = Math.max(spanEnd - spanStart, MS_DAY);

  const pct = (t: number) => ((t - spanStart) / totalMs) * 100;

  const byLane = useMemo(() => {
    const lanes = data?.lanes ?? ["PRODUCT"];
    return lanes.map((lane) => ({ lane, rows: items.filter((i) => i.lane === lane) }));
  }, [data?.lanes, items]);

  const open = items.find((i) => i.jiraKey === openKey) || null;

  const patch = async (jiraKey: string, body: any) => {
    // Optimistic: apply locally, then persist.
    setData((prev) =>
      prev ? { ...prev, items: prev.items.map((i) => (i.jiraKey === jiraKey ? { ...i, ...body } : i)) } : prev
    );
    const res = await fetch(`/api/roadmap/${jiraKey}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) { showToast("Couldn't save — reloading"); load(); }
  };

  const remove = async (jiraKey: string) => {
    setOpenKey(null);
    setData((prev) => (prev ? { ...prev, items: prev.items.filter((i) => i.jiraKey !== jiraKey) } : prev));
    const res = await fetch(`/api/roadmap/${jiraKey}`, { method: "DELETE" });
    if (!res.ok) { showToast("Couldn't remove"); load(); }
    else showToast(`${jiraKey} removed from roadmap`);
  };

  if (error)
    return (
      <div className="p-8">
        <div className="border border-amberBorder bg-amberBg p-4 text-sm text-amberTextDark">{error}</div>
      </div>
    );
  if (!data) return <div className="p-8 text-sm text-muted2 font-mono">Loading roadmap…</div>;

  const todayPct = pct(Date.now());

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <header className="flex items-end justify-between gap-6 px-[30px] pt-6 pb-4 border-b border-border">
        <div className="flex flex-col gap-[7px]">
          <h1 className="m-0 text-[25px] font-semibold tracking-[-0.025em]">Roadmap</h1>
          <p className="m-0 text-[12.5px] text-muted">
            {data.board.name} · dates are ours, status comes live from Jira
          </p>
        </div>
        {editable && (
          <button
            onClick={() => setAddMilestoneOpen(true)}
            className="h-[34px] px-4 text-[13px] font-semibold border border-border hover:border-ink transition-colors"
          >
            + Milestone
          </button>
        )}
      </header>

      {items.length === 0 && milestones.length === 0 ? (
        <div className="p-8">
          <div className="border border-dashed border-border bg-cream px-8 py-10 text-center max-w-[520px]">
            <span className="text-[15px] font-semibold">Nothing on the roadmap yet</span>
            <p className="m-0 mt-2 text-[13px] text-muted leading-[1.6]">
              Stories are added at PBR time — when you clear a story, choose whether to publish it
              here and set its dates. Only what matters to stakeholders needs to appear.
            </p>
          </div>
        </div>
      ) : (
        <div className="flex-1 overflow-auto">
          <div className="min-w-[1100px]">
            {/* month header */}
            <div className="flex sticky top-0 z-20 bg-paper border-b border-border">
              <div className="w-[150px] flex-none border-r border-border" />
              <div className="flex-1 flex relative">
                {months.map((m) => (
                  <div
                    key={m.label}
                    className="border-r border-borderLight px-2 py-[7px] font-mono text-[9.5px] tracking-[.08em] text-muted2"
                    style={{ width: `${((m.end - m.start) / totalMs) * 100}%` }}
                  >
                    {m.label}
                  </div>
                ))}
              </div>
            </div>

            {/* milestones strip */}
            {milestones.length > 0 && (
              <div className="flex border-b border-borderLight bg-cream/40">
                <div className="w-[150px] flex-none border-r border-border px-3 py-2 font-mono text-[9px] tracking-[.1em] text-muted3">
                  MILESTONES
                </div>
                <div className="flex-1 relative h-[42px]">
                  {milestones.map((m) => {
                    const left = pct(new Date(m.date).getTime());
                    return (
                      <div
                        key={m.id}
                        className="absolute top-0 h-full flex items-center gap-1 group"
                        style={{ left: `${left}%`, transform: "translateX(-6px)" }}
                        title={`${m.label} — ${new Date(m.date).toLocaleDateString()}`}
                      >
                        <span className="text-[13px] leading-none">
                          {m.kind === "UAT" ? "★" : m.kind === "REGRESSION" ? "◆" : "▲"}
                        </span>
                        <span className="text-[10.5px] whitespace-nowrap text-ink">{m.label}</span>
                        {editable && (
                          <button
                            onClick={async () => {
                              await fetch(`/api/roadmap/milestones/${m.id}`, { method: "DELETE" });
                              load();
                            }}
                            className="opacity-0 group-hover:opacity-100 text-muted3 hover:text-accent text-[11px]"
                          >
                            ×
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* lanes */}
            {byLane.map(({ lane, rows }) => (
              <div key={lane} className="flex border-b border-border">
                <div className="w-[150px] flex-none border-r border-border px-3 py-3 bg-cream/60">
                  <span className="text-[12.5px] font-semibold">{LANE_LABEL[lane] ?? lane}</span>
                  <span className="block font-mono text-[9.5px] text-muted3 mt-[3px]">{rows.length}</span>
                </div>
                <div className="flex-1 relative py-2" style={{ minHeight: 54 }}>
                  {/* today line */}
                  {todayPct >= 0 && todayPct <= 100 && (
                    <div
                      className="absolute top-0 bottom-0 w-px bg-accent/60 z-10"
                      style={{ left: `${todayPct}%` }}
                    />
                  )}
                  {rows.length === 0 ? (
                    <div className="px-3 text-[11.5px] text-muted3">—</div>
                  ) : (
                    rows.map((i) => {
                      const s = pct(new Date(i.startDate).getTime());
                      const e = pct(new Date(i.targetDate).getTime());
                      const w = Math.max(e - s, 0.6);
                      const tentative = i.state === "TENTATIVE";
                      return (
                        <div key={i.id} className="relative h-[30px]">
                          <button
                            onClick={() => setOpenKey(i.jiraKey)}
                            className="absolute top-[6px] h-[16px] flex items-center group"
                            style={{ left: `${s}%`, width: `${w}%`, minWidth: 26 }}
                            title={`${i.jiraKey} — ${i.summary}`}
                          >
                            <span
                              className={`h-[10px] w-full rounded-full ${
                                tentative ? "bg-[#B7B2A6]" : i.done ? "bg-good" : "bg-[#3B5BA9]"
                              }`}
                            />
                            <span className="absolute left-full ml-2 whitespace-nowrap text-[11.5px] flex items-center gap-[6px]">
                              {i.done && <span className="text-good">✓</span>}
                              {i.version && (
                                <span className="font-mono text-[9.5px] text-muted2">[{i.version}]</span>
                              )}
                              <span className={tentative ? "text-muted2" : "text-ink"}>{i.summary}</span>
                              {i.overdueDays > 0 && (
                                <span className="font-mono text-[9.5px] text-accent">
                                  {i.overdueDays}d overdue
                                </span>
                              )}
                            </span>
                          </button>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* side panel */}
      {open && (
        <div className="fixed inset-0 z-[60] flex justify-end bg-ink/20" onClick={() => setOpenKey(null)}>
          <div
            className="w-[380px] h-full bg-white border-l border-border flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-4 border-b border-borderLight flex items-start gap-3">
              <div className="flex flex-col gap-1 min-w-0">
                <span className="font-mono text-[11px] text-key">{open.jiraKey}</span>
                <span className="text-[14px] font-semibold leading-[1.35]">{open.summary}</span>
                {open.status && (
                  <span className="font-mono text-[10px] tracking-[.06em] text-muted2 mt-1">
                    JIRA: {open.status.toUpperCase()}
                  </span>
                )}
              </div>
              <button onClick={() => setOpenKey(null)} className="ml-auto text-muted3 hover:text-ink text-[16px] leading-none">×</button>
            </div>

            <div className="p-5 flex flex-col gap-4 overflow-y-auto">
              {!editable && (
                <p className="m-0 text-[12px] text-muted3">You have view-only access to the roadmap.</p>
              )}

              <Field label="Start">
                <input
                  type="date"
                  disabled={!editable}
                  value={open.startDate.slice(0, 10)}
                  onChange={(e) => patch(open.jiraKey, { startDate: e.target.value })}
                  className="h-[34px] px-2 border border-border text-[13px] w-full disabled:bg-cream"
                />
              </Field>
              <Field label="Target">
                <input
                  type="date"
                  disabled={!editable}
                  value={open.targetDate.slice(0, 10)}
                  onChange={(e) => patch(open.jiraKey, { targetDate: e.target.value })}
                  className="h-[34px] px-2 border border-border text-[13px] w-full disabled:bg-cream"
                />
              </Field>
              <Field label="Version">
                <input
                  disabled={!editable}
                  defaultValue={open.version ?? ""}
                  placeholder="v4.7.0.1"
                  onBlur={(e) => patch(open.jiraKey, { version: e.target.value })}
                  className="h-[34px] px-2 border border-border text-[13px] w-full disabled:bg-cream"
                />
              </Field>
              <Field label="Lane">
                <select
                  disabled={!editable}
                  value={open.lane}
                  onChange={(e) => patch(open.jiraKey, { lane: e.target.value })}
                  className="h-[34px] px-2 border border-border text-[13px] w-full bg-white disabled:bg-cream"
                >
                  {(data.lanes ?? []).map((l) => (
                    <option key={l} value={l}>{LANE_LABEL[l] ?? l}</option>
                  ))}
                </select>
              </Field>
              <Field label="Confidence">
                <div className="flex gap-2">
                  {(["CONFIRMED", "TENTATIVE"] as const).map((st) => (
                    <button
                      key={st}
                      disabled={!editable}
                      onClick={() => patch(open.jiraKey, { state: st })}
                      className={`flex-1 h-[34px] text-[12px] font-semibold border transition-colors ${
                        open.state === st
                          ? st === "CONFIRMED"
                            ? "bg-[#3B5BA9] text-white border-[#3B5BA9]"
                            : "bg-[#B7B2A6] text-white border-[#B7B2A6]"
                          : "bg-white border-border text-muted2"
                      } disabled:opacity-60`}
                    >
                      {st === "CONFIRMED" ? "Confirmed" : "Tentative"}
                    </button>
                  ))}
                </div>
              </Field>

              {open.overdueDays > 0 && (
                <div className="border-l-2 border-accent pl-3 text-[12.5px] text-accent leading-[1.5]">
                  Target passed {open.overdueDays} days ago and Jira still shows{" "}
                  {open.status ?? "not done"}. Re-date it or mark it tentative.
                </div>
              )}

              {editable && (
                <button
                  onClick={() => remove(open.jiraKey)}
                  className="self-start text-[12.5px] text-accent hover:underline mt-2"
                >
                  Remove from roadmap
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {addMilestoneOpen && (
        <MilestoneModal
          onClose={() => setAddMilestoneOpen(false)}
          onCreated={() => { setAddMilestoneOpen(false); load(); }}
          onError={showToast}
        />
      )}

      {toast && <Toast message={toast} />}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-[5px]">
      <span className="font-mono text-[9.5px] tracking-[.1em] text-muted3">{label.toUpperCase()}</span>
      {children}
    </label>
  );
}

function MilestoneModal({
  onClose,
  onCreated,
  onError,
}: {
  onClose: () => void;
  onCreated: () => void;
  onError: (m: string) => void;
}) {
  const [label, setLabel] = useState("");
  const [date, setDate] = useState("");
  const [kind, setKind] = useState("RELEASE");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!label.trim() || !date) return;
    setBusy(true);
    const res = await fetch("/api/roadmap/milestones", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label, date, kind }),
    });
    setBusy(false);
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      onError(d.error || "Couldn't create milestone");
      return;
    }
    onCreated();
  };

  return (
    <div className="fixed inset-0 bg-ink/40 z-[70] flex items-center justify-center p-6" onClick={onClose}>
      <div className="w-[380px] bg-white border border-border p-5 flex flex-col gap-4" onClick={(e) => e.stopPropagation()}>
        <span className="text-[15px] font-semibold">Add milestone</span>
        <p className="m-0 text-[12px] text-muted leading-[1.5]">
          A dated marker on the timeline — a release, UAT or regression window. Not tied to a story.
        </p>
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="UAT Release v4.9.x.x"
          className="h-[36px] px-3 border border-border text-[13px] outline-none focus:border-ink"
        />
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="h-[36px] px-3 border border-border text-[13px]"
        />
        <select
          value={kind}
          onChange={(e) => setKind(e.target.value)}
          className="h-[36px] px-2 border border-border text-[13px] bg-white"
        >
          <option value="RELEASE">Production Release ▲</option>
          <option value="UAT">UAT Release ★</option>
          <option value="REGRESSION">Regression ◆</option>
          <option value="OTHER">Other</option>
        </select>
        <div className="flex gap-2 justify-end">
          <button onClick={onClose} className="h-[34px] px-3 text-[12.5px] border border-border">Cancel</button>
          <button
            onClick={submit}
            disabled={busy || !label.trim() || !date}
            className="h-[34px] px-4 text-[12.5px] font-semibold bg-ink text-white disabled:opacity-40"
          >
            {busy ? "Adding…" : "Add"}
          </button>
        </div>
      </div>
    </div>
  );
}
