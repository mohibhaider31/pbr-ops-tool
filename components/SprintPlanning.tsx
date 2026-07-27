"use client";

import { useEffect, useState, useCallback } from "react";

type OwedItem = {
  jiraKey: string;
  summary: string;
  status: "NOT_STARTED" | "IN_PROGRESS";
  upstreamDoneAt: string | null;
  upstreamSprint: string | null;
};
type Group = { layer: string; label: string; items: OwedItem[] };

const STATUS_LABEL: Record<string, string> = {
  NOT_STARTED: "Not started",
  IN_PROGRESS: "In progress",
};

function daysAgo(iso: string | null): string | null {
  if (!iso) return null;
  const then = new Date(iso).getTime();
  const days = Math.floor((Date.now() - then) / 86400000);
  if (days <= 0) return "today";
  if (days === 1) return "1 day";
  if (days < 14) return `${days} days`;
  return `${Math.floor(days / 7)} weeks`;
}

export default function SprintPlanning() {
  const [groups, setGroups] = useState<Group[] | null>(null);
  const [totalOwed, setTotalOwed] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/pipeline/sprint-planning");
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setGroups(data.groups);
      setTotalOwed(data.totalOwed);
      setError(null);
    } catch (e: any) {
      setError(e.message);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (error) {
    return (
      <div className="p-8">
        <div className="border border-amberBorder bg-amberBg p-4 text-sm text-amberTextDark">{error}</div>
      </div>
    );
  }
  if (!groups) return <div className="p-8 text-sm text-muted2 font-mono">Loading carryover…</div>;

  if (totalOwed === 0) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="border border-dashed border-border bg-cream px-8 py-10 flex flex-col items-center gap-3 max-w-[460px] text-center">
          <span className="text-[15px] font-semibold">No carryover work</span>
          <p className="m-0 text-[13px] text-muted leading-[1.55]">
            When an upstream layer finishes but the next hasn&apos;t, the owed work shows up here — grouped by the
            layer that needs to pick it up. Nothing is owed across your tracked stories right now.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="px-[30px] py-5 border-b border-borderLight bg-cream">
        <p className="m-0 text-[13px] text-muted leading-[1.55] max-w-[680px]">
          Carryover work: upstream layers finished, downstream layers still owe. Use this to plan the next sprint —
          each group is the backlog that layer must pick up. Ordered longest-owed first.
        </p>
      </div>

      <div className="px-[30px] py-6 flex flex-col gap-8 max-w-[880px]">
        {groups.map((g) => (
          <section key={g.layer} className="flex flex-col gap-3">
            <div className="flex items-center gap-3">
              <h2 className="m-0 text-[15px] font-semibold">{g.label} owes</h2>
              <span className="font-mono text-[11px] text-muted2 bg-white border border-border px-[7px] py-[2px]">
                {g.items.length} {g.items.length === 1 ? "story" : "stories"}
              </span>
            </div>

            <div className="border border-borderLight bg-white">
              <div
                className="grid gap-0 px-4 items-center h-[30px] border-b border-borderLight bg-paper"
                style={{ gridTemplateColumns: "64px minmax(160px,1fr) 110px 140px" }}
              >
                <span className="font-mono text-[9px] tracking-[.11em] text-muted3">KEY</span>
                <span className="font-mono text-[9px] tracking-[.11em] text-muted3 pr-3">SUMMARY</span>
                <span className="font-mono text-[9px] tracking-[.11em] text-muted3">THIS LAYER</span>
                <span className="font-mono text-[9px] tracking-[.11em] text-muted3 text-right">OWED SINCE</span>
              </div>
              {g.items.map((item) => {
                const since = daysAgo(item.upstreamDoneAt);
                return (
                  <div
                    key={item.jiraKey}
                    className="grid gap-0 px-4 items-center min-h-[42px] py-2 border-b border-borderFaint last:border-b-0"
                    style={{ gridTemplateColumns: "64px minmax(160px,1fr) 110px 140px" }}
                  >
                    <span className="font-mono text-[12px] font-medium text-key">{item.jiraKey}</span>
                    <span className="text-[13px] pr-3 overflow-hidden text-ellipsis whitespace-nowrap">
                      {item.summary}
                    </span>
                    <span className="font-mono text-[10.5px] text-muted">
                      {STATUS_LABEL[item.status] || item.status}
                    </span>
                    <div className="text-right flex flex-col">
                      {since ? (
                        <span className="font-mono text-[11px] text-amberText">{since}</span>
                      ) : (
                        <span className="font-mono text-[11px] text-muted3">—</span>
                      )}
                      {item.upstreamSprint && (
                        <span className="font-mono text-[9.5px] text-muted3">from {item.upstreamSprint}</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
