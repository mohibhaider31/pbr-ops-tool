"use client";

import { useEffect, useMemo, useState } from "react";

type Available = { jiraKey: string; summary: string; jiraStatus: string };

export default function AddStoriesModal({
  onClose,
  onAdded,
}: {
  onClose: () => void;
  onAdded: (count: number) => void;
}) {
  const [available, setAvailable] = useState<Available[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch("/api/pipeline/available")
      .then((r) => r.json())
      .then((d) => {
        if (d.error) setError(d.error);
        else setAvailable(d.available);
      })
      .catch((e) => setError(e.message));
  }, []);

  const filtered = useMemo(() => {
    if (!available) return [];
    if (!query.trim()) return available;
    const q = query.trim().toLowerCase();
    return available.filter(
      (s) => s.jiraKey.toLowerCase().includes(q) || s.summary.toLowerCase().includes(q)
    );
  }, [available, query]);

  const toggle = (key: string) => {
    setPicked((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  const submit = async () => {
    if (picked.size === 0) return;
    setBusy(true);
    const res = await fetch("/api/pipeline", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jiraKeys: [...picked] }),
    });
    setBusy(false);
    if (res.ok) onAdded(picked.size);
  };

  return (
    <div className="fixed inset-0 bg-ink/40 z-[40] flex items-center justify-center p-6">
      <div className="w-[640px] max-h-[80vh] bg-white border border-[#C8C3B8] flex flex-col animate-riseIn">
        <div className="px-6 pt-5 pb-4 border-b border-borderLight flex items-center gap-3">
          <div className="flex flex-col gap-1 flex-1">
            <span className="font-mono text-[10px] tracking-[.11em] text-muted2">ADD TO PIPELINE</span>
            <h3 className="m-0 text-[18px] font-semibold tracking-[-0.02em]">Pick active stories to track</h3>
          </div>
          <button onClick={onClose} className="bg-transparent border-none text-[18px] text-muted2 cursor-pointer leading-none">
            ×
          </button>
        </div>

        <div className="px-6 py-3 border-b border-borderLight">
          <div className="flex items-center gap-2 bg-cream border border-border px-3 h-[36px]">
            <span className="text-muted4 text-[13px]">⌕</span>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search key or summary"
              className="border-none outline-none bg-transparent text-[13px] w-full text-ink"
              autoFocus
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {error && <div className="p-6 text-sm text-accent">{error}</div>}
          {!available && !error && <div className="p-6 text-sm text-muted2 font-mono">Loading active stories…</div>}
          {available && filtered.length === 0 && (
            <div className="p-6 text-sm text-muted2 text-center">
              {query ? "No matches." : "Every active story is already in the pipeline."}
            </div>
          )}
          {filtered.map((s) => {
            const on = picked.has(s.jiraKey);
            return (
              <button
                key={s.jiraKey}
                onClick={() => toggle(s.jiraKey)}
                className={`w-full text-left flex items-center gap-3 px-6 py-[10px] border-b border-borderFaint transition-colors ${
                  on ? "bg-accent/[.06]" : "hover:bg-cream"
                }`}
              >
                <span
                  className={`w-[16px] h-[16px] border flex items-center justify-center text-[10px] flex-none ${
                    on ? "bg-accent border-accent text-white" : "border-border"
                  }`}
                >
                  {on ? "✓" : ""}
                </span>
                <span className="font-mono text-[12px] font-medium text-key w-[64px] flex-none">{s.jiraKey}</span>
                <span className="text-[13px] flex-1 overflow-hidden text-ellipsis whitespace-nowrap">{s.summary}</span>
                <span className="font-mono text-[10px] text-muted3 flex-none">{s.jiraStatus}</span>
              </button>
            );
          })}
        </div>

        <div className="px-6 py-4 border-t border-borderLight flex items-center gap-3">
          <span className="text-[12.5px] text-muted flex-1">
            {picked.size > 0 ? `${picked.size} selected` : "Select one or more stories"}
          </span>
          <button onClick={onClose} className="h-[36px] px-4 text-[13px] text-muted border border-border bg-white">
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={busy || picked.size === 0}
            className="h-[36px] px-4 text-[13px] font-semibold bg-accent text-white disabled:opacity-40"
          >
            {busy ? "Adding…" : `Add ${picked.size || ""}`.trim()}
          </button>
        </div>
      </div>
    </div>
  );
}
