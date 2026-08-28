"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import type { Story } from "@/lib/types";
import { STAGE_META } from "@/lib/stage";
import { avatarColor, initials } from "@/lib/avatar";
import StoryDrawer from "./StoryDrawer";
import Toast from "./Toast";
import { useSync } from "./SyncProvider";
import { useViewer } from "@/lib/useViewer";

type Filter = "all" | "unassigned" | "assigned" | "in_review" | "questions" | "done";

export default function BacklogBoard() {
  const { can } = useViewer();
  const { run } = useSync();
  const [stories, setStories] = useState<Story[] | null>(null);
  const [statuses, setStatuses] = useState<string[]>([]);
  const [statusFilter, setStatusFilter] = useState<Set<string>>(new Set());
  const [sortBy, setSortBy] = useState<"priority" | "summary" | "status" | "key" | "points">("priority");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [openStory, setOpenStory] = useState<any | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [dragKey, setDragKey] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/jira/backlog");
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setStories(data.stories);
      setStatuses(data.statuses || []);
      setError(null);
    } catch (e: any) {
      setError(e.message);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3200);
  };

  const filtered = useMemo(() => {
    if (!stories) return [];
    let list = stories;
    if (query.trim()) {
      const q = query.trim().toLowerCase();
      list = list.filter(
        (s) => s.jiraKey.toLowerCase().includes(q) || s.jira.summary.toLowerCase().includes(q)
      );
    }
    // Jira status multi-select (empty set = all statuses)
    if (statusFilter.size > 0) {
      list = list.filter((s) => statusFilter.has(s.jira.status));
    }
    // Tool workflow-stage chips
    switch (filter) {
      case "unassigned":
        list = list.filter((s) => s.assignees.length === 0);
        break;
      case "assigned":
        list = list.filter((s) => s.assignees.length > 0 && s.stage !== "PBR_DONE");
        break;
      case "in_review":
        list = list.filter((s) => s.stage === "IN_REVIEW");
        break;
      case "questions":
        list = list.filter((s) => s.comments.some((c) => c.isQuestion));
        break;
      case "done":
        list = list.filter((s) => s.stage === "PBR_DONE");
        break;
    }
    // Sorting. "priority" preserves the manual drag order (priorityOrder).
    if (sortBy !== "priority") {
      const dir = sortDir === "asc" ? 1 : -1;
      list = [...list].sort((a, b) => {
        let av: string | number, bv: string | number;
        switch (sortBy) {
          case "summary": av = a.jira.summary.toLowerCase(); bv = b.jira.summary.toLowerCase(); break;
          case "status": av = a.jira.status.toLowerCase(); bv = b.jira.status.toLowerCase(); break;
          case "key":
            // Sort by numeric part of the key so RAE-9 < RAE-100
            av = parseInt(a.jiraKey.split("-")[1] || "0", 10);
            bv = parseInt(b.jiraKey.split("-")[1] || "0", 10);
            break;
          case "points": av = a.jira.storyPoints ?? -1; bv = b.jira.storyPoints ?? -1; break;
          default: av = 0; bv = 0;
        }
        if (av < bv) return -1 * dir;
        if (av > bv) return 1 * dir;
        return 0;
      });
    } else if (sortDir === "desc") {
      list = [...list].reverse();
    }
    return list;
  }, [stories, query, filter, statusFilter, sortBy, sortDir]);

  const stats = useMemo(() => {
    const all = stories || [];
    return [
      { label: "TOTAL STORIES", value: all.length, note: "all statuses" },
      { label: "ASSIGNED", value: all.filter((s) => s.assignees.length > 0).length, note: "have reviewers" },
      { label: "READY FOR PBR", value: all.filter((s) => s.stage === "IN_REVIEW").length, note: "all reviewed" },
      { label: "PBR DONE", value: all.filter((s) => s.stage === "PBR_DONE").length, note: "this session" },
    ];
  }, [stories]);

  const filterChips: { key: Filter; label: string; count: number }[] = useMemo(() => {
    const all = stories || [];
    return [
      { key: "all", label: "All", count: all.length },
      { key: "unassigned", label: "Unassigned", count: all.filter((s) => s.assignees.length === 0).length },
      { key: "assigned", label: "Assigned", count: all.filter((s) => s.assignees.length > 0 && s.stage !== "PBR_DONE").length },
      { key: "in_review", label: "Ready for PBR", count: all.filter((s) => s.stage === "IN_REVIEW").length },
      { key: "questions", label: "Has questions", count: all.filter((s) => s.comments.some((c) => c.isQuestion)).length },
    ];
  }, [stories]);

  const reorder = (fromKey: string, toKey: string) => {
    if (!can("prioritize")) return;
    if (!stories || fromKey === toKey) return;
    const fromIdx = stories.findIndex((s) => s.jiraKey === fromKey);
    const toIdx = stories.findIndex((s) => s.jiraKey === toKey);
    if (fromIdx < 0 || toIdx < 0) return;

    const next = [...stories];
    const [moved] = next.splice(fromIdx, 1);
    next.splice(toIdx, 0, moved);
    setStories(next); // optimistic: order updates instantly, no reload flash

    // Priority lives in our own DB, so no Jira wait and no full reload needed.
    run("priority", async () => {
      const res = await fetch(`/api/stories/${fromKey}/priority`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newOrder: toIdx }),
      });
      if (!res.ok) throw new Error("priority sync failed");
    });
  };

  // Patch one story in place from a mutation response. Replaces the old
  // onChanged={load}, which refetched the ENTIRE backlog (including the Jira
  // scan) after every comment, assign, or review toggle.
  const applyStoryUpdate = useCallback((updated?: any) => {
    if (!updated?.jiraKey) { load(); return; } // fall back if the route didn't return one
    setOpenStory((cur: any) => (cur && cur.jiraKey === updated.jiraKey ? { ...cur, ...updated } : cur));
    setStories((prev) =>
      prev?.map((s) =>
        s.jiraKey === updated.jiraKey
          ? {
              ...s,
              assignees: updated.assignees ?? s.assignees,
              stage: updated.stage ?? s.stage,
              questionCount: Array.isArray(updated.comments)
                ? updated.comments.filter((c: any) => c.isQuestion).length
                : (s as any).questionCount,
              jira: s.jira,
            }
          : s
      ) || prev
    );
  }, [load]);

  // The list is a projection (no comment bodies), so the drawer fetches the
  // full story on open instead of reading it out of the list.
  useEffect(() => {
    if (!openKey) { setOpenStory(null); return; }
    let alive = true;
    fetch(`/api/stories/${openKey}`)
      .then((r) => r.json())
      .then((d) => { if (alive && d?.story) setOpenStory(d.story); })
      .catch(() => {});
    return () => { alive = false; };
  }, [openKey]);

  if (error) {
    return (
      <div className="p-8">
        <div className="border border-amberBorder bg-amberBg p-4 text-sm text-amberTextDark">
          Couldn&apos;t load the backlog: {error}
        </div>
      </div>
    );
  }

  if (!stories) {
    return (
      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="flex items-end justify-between gap-6 px-[30px] pt-6 pb-4 border-b border-border">
          <div className="flex flex-col gap-[7px]">
            <h1 className="m-0 text-[25px] font-semibold tracking-[-0.025em]">Backlog Review</h1>
            <p className="m-0 text-[12.5px] text-muted">Browse, filter, and triage all stories. Prioritize and clear for PBR.</p>
          </div>
        </header>
        {/* Stat cards skeleton */}
        <div className="grid grid-cols-4 gap-px bg-border border-b border-border">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="bg-paper px-[30px] pt-[14px] pb-[15px] flex flex-col gap-[7px]">
              <div className="h-[9px] w-[70px] bg-borderLight animate-pulse" />
              <div className="h-[20px] w-[40px] bg-borderLight animate-pulse" />
            </div>
          ))}
        </div>
        {/* Row skeletons */}
        <div className="flex-1 overflow-hidden">
          <div className="px-[30px] py-3 border-b border-borderLight flex items-center gap-3">
            <div className="h-[9px] w-[300px] bg-borderLight animate-pulse" />
          </div>
          {Array.from({ length: 12 }).map((_, i) => (
            <div
              key={i}
              className="grid gap-0 px-[30px] items-center h-[46px] border-b border-borderLight"
              style={{ gridTemplateColumns: "46px 64px minmax(160px,1fr) 34px 112px 34px 130px" }}
            >
              <div className="h-[11px] w-[16px] bg-borderLight animate-pulse" />
              <div className="h-[11px] w-[46px] bg-borderLight animate-pulse" />
              <div className="h-[11px] bg-borderLight animate-pulse" style={{ width: `${45 + ((i * 7) % 40)}%` }} />
              <div className="h-[11px] w-[16px] bg-borderLight animate-pulse" />
              <div />
              <div />
              <div className="h-[11px] w-[70px] bg-borderLight animate-pulse ml-auto" />
            </div>
          ))}
          <div className="px-[30px] py-4 text-[11.5px] text-muted3 font-mono">Loading all stories from Jira…</div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <header className="flex items-end justify-between gap-6 px-[30px] pt-6 pb-4 border-b border-border">
        <div className="flex flex-col gap-[5px]">
          <h1 className="m-0 text-[25px] font-semibold tracking-[-0.025em]">Backlog Review</h1>
          <p className="m-0 text-[12.5px] text-muted">
            Browse, filter, and triage all stories. Prioritize and clear for PBR.
          </p>
        </div>
        <div className="flex items-center gap-[10px]">
          <div className="flex items-center gap-2 bg-white border border-border px-[11px] h-[38px] w-[210px]">
            <span className="text-muted4 text-[13px]">⌕</span>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Key or summary"
              className="border-none outline-none bg-transparent text-[13px] w-full text-ink"
            />
          </div>
        </div>
      </header>

      <div className="grid grid-cols-4 gap-px bg-border border-b border-border">
        {stats.map((s) => (
          <div key={s.label} className="bg-paper px-[30px] pt-[14px] pb-[15px] flex flex-col gap-[3px]">
            <span className="font-mono text-[10px] tracking-[.11em] text-muted2">{s.label}</span>
            <div className="flex items-baseline gap-[7px]">
              <span className="text-[22px] font-semibold text-ink">{s.value}</span>
              <span className="text-[11.5px] text-muted2">{s.note}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between gap-4 px-[30px] py-3 border-b border-borderLight">
        <div className="flex gap-[6px] flex-wrap">
          {filterChips.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`flex items-center gap-2 px-[11px] h-[28px] text-[12.5px] font-medium border transition-colors ${
                filter === f.key
                  ? "bg-ink text-white border-ink"
                  : "bg-white text-muted border-border hover:border-ink"
              }`}
            >
              {f.label}
              <span
                className={`font-mono text-[10px] px-[5px] ${
                  filter === f.key ? "text-white/70" : "text-muted3"
                }`}
              >
                {f.count}
              </span>
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 flex-none">
          <StatusFilterDropdown statuses={statuses} selected={statusFilter} onChange={setStatusFilter} />
          <SortControl sortBy={sortBy} sortDir={sortDir} onSortBy={setSortBy} onToggleDir={() => setSortDir((d) => (d === "asc" ? "desc" : "asc"))} />
          <span className="font-mono text-[11px] text-muted2 tracking-[.04em] whitespace-nowrap">
            {filtered.length} shown
          </span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto overflow-x-hidden">
        <div
          className="grid gap-0 px-[30px] items-center h-[34px] border-b border-borderLight sticky top-0 bg-paper z-[2]"
          style={{ gridTemplateColumns: "46px 64px minmax(160px,1fr) 34px 112px 34px 130px" }}
        >
          <span className="font-mono text-[9.5px] tracking-[.11em] text-muted3">RANK</span>
          <span className="font-mono text-[9.5px] tracking-[.11em] text-muted3">KEY</span>
          <span className="font-mono text-[9.5px] tracking-[.11em] text-muted3 pr-3">SUMMARY</span>
          <span className="font-mono text-[9.5px] tracking-[.11em] text-muted3 text-right">PTS</span>
          <span className="font-mono text-[9.5px] tracking-[.11em] text-muted3 pl-[14px]">REVIEW</span>
          <span className="font-mono text-[9.5px] tracking-[.11em] text-muted3 text-center">Q</span>
          <span className="font-mono text-[9.5px] tracking-[.11em] text-muted3 text-right">PBR STATUS</span>
        </div>

        {filtered.length === 0 && (
          <div className="p-8 text-sm text-muted2 text-center">No stories match this filter.</div>
        )}

        {filtered.map((story, idx) => {
          const meta = STAGE_META[story.stage];
          const doneCount = story.assignees.filter((a) => a.markedDone).length;
          const qCount = (story as any).questionCount ?? 0;
          const canDrag = can("prioritize") && sortBy === "priority" && !query.trim() && statusFilter.size === 0 && filter === "all";

          return (
            <div
              key={story.jiraKey}
              draggable={canDrag}
              onDragStart={() => canDrag && setDragKey(story.jiraKey)}
              onDragOver={(e) => canDrag && e.preventDefault()}
              onDrop={(e) => {
                if (!canDrag) return;
                e.preventDefault();
                if (dragKey) reorder(dragKey, story.jiraKey);
                setDragKey(null);
              }}
              onDragEnd={() => setDragKey(null)}
              onClick={() => setOpenKey(story.jiraKey)}
              className="grid gap-0 px-[30px] items-center h-[46px] border-b border-borderLight cursor-pointer hover:bg-cream transition-colors"
              style={{ gridTemplateColumns: "46px 64px minmax(160px,1fr) 34px 112px 34px 130px" }}
            >
              <div className="flex items-center gap-[7px]">
                {canDrag && <span className="text-muted4 text-[13px] cursor-grab select-none">⠿</span>}
                <span className="font-mono text-[11px] text-muted4">{idx + 1}</span>
              </div>
              <span className="font-mono text-[12px] font-medium text-key">{story.jiraKey}</span>
              <span className="text-[13.5px] pr-3 overflow-hidden text-ellipsis whitespace-nowrap flex items-center gap-2">
                <span className="overflow-hidden text-ellipsis whitespace-nowrap">{story.jira.summary}</span>
                <span className="font-mono text-[9px] tracking-[.04em] text-muted3 border border-borderLight px-[5px] py-[1px] flex-none uppercase">{story.jira.status}</span>
              </span>
              <span className="font-mono text-[12px] text-right text-ink">
                {story.jira.storyPoints ?? "–"}
              </span>
              <div className="flex items-center gap-2 pl-[14px]">
                <div className="flex -space-x-1.5">
                  {story.assignees.slice(0, 3).map((a) => (
                    <span
                      key={a.email}
                      title={a.name}
                      style={{ background: avatarColor(a.email) }}
                      className="w-[20px] h-[20px] rounded-full text-white text-[9px] font-mono font-semibold flex items-center justify-center border-2 border-paper"
                    >
                      {initials(a.name)}
                    </span>
                  ))}
                </div>
                {story.assignees.length > 0 && (
                  <span className="font-mono text-[10px] text-muted2">
                    {doneCount}/{story.assignees.length}
                  </span>
                )}
              </div>
              <span className={`text-center font-mono text-[11px] ${qCount > 0 ? "text-amberText" : "text-muted4"}`}>
                {qCount > 0 ? qCount : "–"}
              </span>
              <div className="flex justify-end">
                <span className={`font-mono text-[9.5px] tracking-[.08em] border px-[7px] py-[3px] ${meta.pillClass}`}>
                  {meta.label.toUpperCase()}
                </span>
              </div>
            </div>
          );
        })}
        <div className="px-[30px] py-[18px] pb-10">
          <span className="text-[12px] text-muted2">
            Drag ⠿ to reorder priority. Click a row to open the story.
          </span>
        </div>
      </div>

      {openStory && (
        <StoryDrawer
          story={openStory}
          onClose={() => setOpenKey(null)}
          onChanged={applyStoryUpdate}
          onToast={showToast}
        />
      )}
      {toast && <Toast message={toast} />}
    </div>
  );
}

// Multi-select dropdown of Jira statuses. Empty selection = all statuses.
function StatusFilterDropdown({
  statuses,
  selected,
  onChange,
}: {
  statuses: string[];
  selected: Set<string>;
  onChange: (s: Set<string>) => void;
}) {
  const [open, setOpen] = useState(false);
  const toggle = (status: string) => {
    const next = new Set(selected);
    next.has(status) ? next.delete(status) : next.add(status);
    onChange(next);
  };
  const label = selected.size === 0 ? "All statuses" : `${selected.size} status${selected.size > 1 ? "es" : ""}`;
  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className={`flex items-center gap-2 h-[28px] px-[11px] text-[12px] border transition-colors ${selected.size > 0 ? "bg-ink text-white border-ink" : "bg-white text-muted border-border hover:border-ink"}`}
      >
        {label}
        <span className={`text-[9px] ${selected.size > 0 ? "text-white/70" : "text-muted3"}`}>▾</span>
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 mt-1 z-20 bg-white border border-border shadow-xl min-w-[200px] max-h-[300px] overflow-y-auto">
            <div className="flex items-center justify-between px-3 py-2 border-b border-borderFaint">
              <span className="font-mono text-[9.5px] tracking-[.09em] text-muted3">STATUS</span>
              {selected.size > 0 && (
                <button onClick={() => onChange(new Set())} className="text-[10.5px] text-key hover:text-accent">Clear</button>
              )}
            </div>
            {statuses.map((s) => (
              <button
                key={s}
                onClick={() => toggle(s)}
                className="w-full flex items-center gap-[9px] px-3 py-[7px] hover:bg-cream text-left transition-colors"
              >
                <span className={`w-[14px] h-[14px] border flex items-center justify-center flex-none ${selected.has(s) ? "bg-ink border-ink" : "border-border"}`}>
                  {selected.has(s) && <span className="text-white text-[9px]">✓</span>}
                </span>
                <span className="text-[12.5px] text-ink">{s}</span>
              </button>
            ))}
            {statuses.length === 0 && <div className="px-3 py-2 text-[12px] text-muted3">No statuses</div>}
          </div>
        </>
      )}
    </div>
  );
}

// Sort control: pick a field, toggle direction.
function SortControl({
  sortBy,
  sortDir,
  onSortBy,
  onToggleDir,
}: {
  sortBy: string;
  sortDir: "asc" | "desc";
  onSortBy: (s: any) => void;
  onToggleDir: () => void;
}) {
  const OPTIONS: { value: string; label: string }[] = [
    { value: "priority", label: "Priority (manual)" },
    { value: "summary", label: "Name" },
    { value: "status", label: "Status" },
    { value: "key", label: "Key" },
    { value: "points", label: "Points" },
  ];
  return (
    <div className="flex items-center border border-border bg-white h-[28px]">
      <select
        value={sortBy}
        onChange={(e) => onSortBy(e.target.value)}
        className="h-full px-2 text-[12px] bg-transparent outline-none cursor-pointer text-muted"
        title="Sort by"
      >
        {OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>Sort: {o.label}</option>
        ))}
      </select>
      <button
        onClick={onToggleDir}
        className="h-full px-2 border-l border-border text-[11px] text-muted2 hover:text-ink hover:bg-cream transition-colors"
        title={sortDir === "asc" ? "Ascending" : "Descending"}
      >
        {sortDir === "asc" ? "↑" : "↓"}
      </button>
    </div>
  );
}
