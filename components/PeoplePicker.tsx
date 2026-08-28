"use client";

import { useEffect, useMemo, useState } from "react";
import { avatarColor, initials } from "@/lib/avatar";

type Person = { id: string; name: string; email: string | null; accountId: string | null; role: string; active: boolean };

// A searchable dropdown of synced people. Used for review assignees and
// pipeline owners so those fields pick real humans instead of free text.
// Two modes:
//   - single (default): fires onPick immediately on each selection
//   - multi: accumulates a selection with checkboxes, fires onPickMany once
//     the user confirms (lets you add several reviewers in one go)
// Falls back gracefully: if someone types an email not in the list, they can
// still add it manually (keeps the old behavior as an escape hatch).
export default function PeoplePicker({
  excludeEmails = [],
  onPick,
  onPickMany,
  multi = false,
  placeholder = "Search people…",
  allowManual = true,
}: {
  excludeEmails?: string[];
  onPick?: (person: { name: string; email: string; accountId?: string | null }) => void;
  onPickMany?: (people: { name: string; email: string; accountId?: string | null }[]) => void;
  multi?: boolean;
  placeholder?: string;
  allowManual?: boolean;
}) {
  const [people, setPeople] = useState<Person[] | null>(null);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Map<string, { name: string; email: string; accountId?: string | null }>>(new Map());

  useEffect(() => {
    fetch("/api/people")
      .then((r) => r.json())
      .then((d) => setPeople(d.people || []))
      .catch(() => setPeople([]));
  }, []);

  const excluded = useMemo(() => new Set(excludeEmails.filter(Boolean).map((e) => e.toLowerCase())), [excludeEmails]);

  const filtered = useMemo(() => {
    if (!people) return [];
    const q = query.trim().toLowerCase();
    return people
      .filter((p) => !(p.email && excluded.has(p.email.toLowerCase())))
      .filter((p) => !q || p.name.toLowerCase().includes(q) || (p.email || "").toLowerCase().includes(q));
  }, [people, query, excluded]);

  const looksLikeEmail = /\S+@\S+\.\S+/.test(query.trim());

  // In multi mode a click toggles selection; in single mode it fires immediately.
  const handlePick = (person: { name: string; email: string; accountId?: string | null }, key: string) => {
    if (multi) {
      setSelected((prev) => {
        const next = new Map(prev);
        next.has(key) ? next.delete(key) : next.set(key, person);
        return next;
      });
    } else {
      onPick?.(person);
      setQuery("");
    }
  };

  const confirmMany = () => {
    if (selected.size === 0) return;
    onPickMany?.(Array.from(selected.values()));
    setSelected(new Map());
    setQuery("");
  };

  return (
    <div className="border border-border bg-cream p-[9px] flex flex-col gap-2">
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={placeholder}
        autoFocus
        className="text-[13px] px-[9px] py-[6px] border border-border bg-white outline-none"
      />
      <div className="max-h-[180px] overflow-y-auto flex flex-col">
        {!people && <span className="text-[12px] text-muted3 px-1 py-2 font-mono">Loading…</span>}
        {people && filtered.length === 0 && !looksLikeEmail && (
          <span className="text-[12px] text-muted3 px-1 py-2">
            {query ? "No matching people. Try Sync from Jira in Settings, or type a full email." : "No people yet — sync from Jira in Settings."}
          </span>
        )}
        {filtered.map((p) => {
          const key = p.email || p.name;
          const isSel = selected.has(key);
          return (
            <button
              key={p.id}
              onClick={() => handlePick({ name: p.name, email: p.email || p.name, accountId: p.accountId }, key)}
              className={`flex items-center gap-[9px] px-1 py-[6px] hover:bg-white text-left transition-colors ${isSel ? "bg-white" : ""}`}
            >
              {multi && (
                <span className={`w-[16px] h-[16px] border flex items-center justify-center flex-none ${isSel ? "bg-ink border-ink" : "border-border"}`}>
                  {isSel && <span className="text-white text-[10px]">✓</span>}
                </span>
              )}
              <span style={{ background: avatarColor(p.email || p.name) }} className="w-[22px] h-[22px] rounded-full text-white text-[9.5px] font-mono font-semibold flex items-center justify-center flex-none">
                {initials(p.name)}
              </span>
              <span className="flex flex-col min-w-0">
                <span className="text-[13px] overflow-hidden text-ellipsis whitespace-nowrap">{p.name}</span>
                {p.email && <span className="text-[10.5px] text-muted3 overflow-hidden text-ellipsis whitespace-nowrap">{p.email}</span>}
              </span>
              {!p.active && <span className="ml-auto font-mono text-[8.5px] tracking-[.06em] text-amberText flex-none">INVITED</span>}
            </button>
          );
        })}
        {/* Manual email escape hatch */}
        {allowManual && looksLikeEmail && !filtered.some((p) => p.email?.toLowerCase() === query.trim().toLowerCase()) && (
          <button
            onClick={() => handlePick({ name: query.trim(), email: query.trim() }, query.trim())}
            className="flex items-center gap-[9px] px-1 py-[6px] hover:bg-white text-left border-t border-borderFaint mt-1"
          >
            <span className="w-[22px] h-[22px] rounded-full border border-dashed border-border text-muted3 text-[13px] flex items-center justify-center flex-none">+</span>
            <span className="text-[12.5px] text-muted">
              {multi && selected.has(query.trim()) ? "Selected " : "Add "}&ldquo;{query.trim()}&rdquo;
            </span>
          </button>
        )}
      </div>
      {multi && (
        <button
          onClick={confirmMany}
          disabled={selected.size === 0}
          className="h-[34px] text-[12.5px] font-semibold bg-ink text-white disabled:opacity-40 transition-opacity"
        >
          {selected.size === 0 ? "Select reviewers to add" : `Add ${selected.size} reviewer${selected.size > 1 ? "s" : ""}`}
        </button>
      )}
    </div>
  );
}
