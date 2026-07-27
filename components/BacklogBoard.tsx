"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import type { Story } from "@/lib/types";
import { STAGE_META } from "@/lib/stage";
import { avatarColor, initials } from "@/lib/avatar";
import StoryDrawer from "./StoryDrawer";
import Toast from "./Toast";

type Filter = "all" | "unassigned" | "assigned" | "in_review" | "questions" | "done";

export default function BacklogBoard() {
  const [stories, setStories] = useState<Story[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [dragKey, setDragKey] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/jira/backlog");
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setStories(data.stories);
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
    switch (filter) {
      case "unassigned":
        return list.filter((s) => s.assignees.length === 0);
      case "assigned":
        return list.filter((s) => s.assignees.length > 0 && s.stage !== "PBR_DONE");
      case "in_review":
        return list.filter((s) => s.stage === "IN_REVIEW");
      case "questions":
        return list.filter((s) => s.comments.some((c) => c.isQuestion));
      case "done":
        return list.filter((s) => s.stage === "PBR_DONE");
      default:
        return list;
    }
  }, [stories, query, filter]);

  const stats = useMemo(() => {
    const all = stories || [];
    return [
      { label: "TOTAL BACKLOG", value: all.length, note: "in To Do" },
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

  const reorder = async (fromKey: string, toKey: string) => {
    if (!stories || fromKey === toKey) return;
    const fromIdx = stories.findIndex((s) => s.jiraKey === fromKey);
    const toIdx = stories.findIndex((s) => s.jiraKey === toKey);
    if (fromIdx < 0 || toIdx < 0) return;

    const next = [...stories];
    const [moved] = next.splice(fromIdx, 1);
    next.splice(toIdx, 0, moved);
    setStories(next);

    await fetch(`/api/stories/${fromKey}/priority`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ newOrder: toIdx }),
    });
    load();
  };

  const openStory = stories?.find((s) => s.jiraKey === openKey) || null;

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
      <div className="p-8 text-sm text-muted2 font-mono">Loading backlog…</div>
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <header className="flex items-end justify-between gap-6 px-[30px] pt-6 pb-4 border-b border-border">
        <div className="flex flex-col gap-[5px]">
          <h1 className="m-0 text-[25px] font-semibold tracking-[-0.025em]">Backlog Review</h1>
          <p className="m-0 text-[12.5px] text-muted">
            Prioritize, assign, and clear stories for PBR.
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
        <span className="font-mono text-[11px] text-muted2 tracking-[.04em]">
          {filtered.length} shown
        </span>
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
          const qCount = story.comments.filter((c) => c.isQuestion).length;

          return (
            <div
              key={story.jiraKey}
              draggable
              onDragStart={() => setDragKey(story.jiraKey)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
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
                <span className="text-muted4 text-[13px] cursor-grab select-none">⠿</span>
                <span className="font-mono text-[11px] text-muted4">{idx + 1}</span>
              </div>
              <span className="font-mono text-[12px] font-medium text-key">{story.jiraKey}</span>
              <span className="text-[13.5px] pr-3 overflow-hidden text-ellipsis whitespace-nowrap">
                {story.jira.summary}
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
          onChanged={load}
          onToast={showToast}
        />
      )}
      {toast && <Toast message={toast} />}
    </div>
  );
}
