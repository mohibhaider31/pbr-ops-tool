"use client";

import { useState } from "react";
import { useViewer } from "@/lib/useViewer";

// Shown in the story drawer at PBR time.
//
// Two jobs:
//  1. REMIND — if the story is already roadmap-committed, say so prominently,
//     with its target date. A commitment made to stakeholders should influence
//     what gets picked up, which only works if it's visible during refinement.
//  2. PUBLISH — let the PO put the story on the roadmap with dates, without
//     leaving the drawer.

type Roadmap = {
  startDate: string;
  targetDate: string;
  state: "CONFIRMED" | "TENTATIVE";
  lane: string;
  version: string | null;
} | null;

const LANES = [
  { v: "PRODUCT", label: "Product" },
  { v: "HOUSEKEEPING", label: "House Keeping" },
  { v: "RESOURCE", label: "Resource" },
];

export default function RoadmapPanel({
  jiraKey,
  roadmap,
  onChanged,
}: {
  jiraKey: string;
  roadmap: Roadmap;
  onChanged: () => void;
}) {
  const { can } = useViewer();
  const editable = can("roadmap_edit");

  const [open, setOpen] = useState(false);
  const [start, setStart] = useState("");
  const [target, setTarget] = useState("");
  const [version, setVersion] = useState("");
  const [lane, setLane] = useState("PRODUCT");
  const [tentative, setTentative] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Already on the roadmap → remind, don't offer to re-add.
  if (roadmap) {
    const overdue = new Date(roadmap.targetDate).getTime() < Date.now();
    return (
      <div className="border-l-2 border-[#3B5BA9] pl-3 py-1 flex flex-col gap-[3px]">
        <span className="font-mono text-[9.5px] tracking-[.1em] text-muted3">ON THE ROADMAP</span>
        <span className="text-[12.5px]">
          {roadmap.state === "TENTATIVE" ? "Tentative" : "Committed"} for{" "}
          <span className="font-semibold">
            {new Date(roadmap.targetDate).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}
          </span>
          {roadmap.version && <span className="font-mono text-[10.5px] text-muted2"> · {roadmap.version}</span>}
        </span>
        <span className={`text-[11.5px] ${overdue ? "text-accent" : "text-muted"}`}>
          {overdue
            ? "Target date has passed — this needs prioritising or re-dating."
            : "Stakeholders are expecting this — prioritise accordingly."}
        </span>
      </div>
    );
  }

  if (!editable) return null;

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="self-start text-[12.5px] text-key hover:text-accent"
      >
        + Add to roadmap
      </button>
    );
  }

  const ready = !!start && !!target && target >= start;

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/roadmap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jiraKey,
          startDate: start,
          targetDate: target,
          version: version || null,
          lane,
          state: tentative ? "TENTATIVE" : "CONFIRMED",
        }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || "Couldn't add to roadmap");
      setOpen(false);
      onChanged();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="border border-borderLight bg-cream/40 p-3 flex flex-col gap-[10px]">
      <span className="text-[12.5px] font-semibold">Add to roadmap</span>
      <p className="m-0 text-[11.5px] text-muted leading-[1.5]">
        Only publish what stakeholders need to see. Status will update itself from Jira.
      </p>

      <div className="flex gap-2">
        <label className="flex-1 flex flex-col gap-[3px]">
          <span className="font-mono text-[9px] tracking-[.09em] text-muted3">START</span>
          <input type="date" value={start} onChange={(e) => setStart(e.target.value)}
            className="h-[30px] px-2 border border-border text-[12px]" />
        </label>
        <label className="flex-1 flex flex-col gap-[3px]">
          <span className="font-mono text-[9px] tracking-[.09em] text-muted3">TARGET</span>
          <input type="date" value={target} onChange={(e) => setTarget(e.target.value)}
            className="h-[30px] px-2 border border-border text-[12px]" />
        </label>
      </div>

      <div className="flex gap-2">
        <input
          value={version}
          onChange={(e) => setVersion(e.target.value)}
          placeholder="Version (optional)"
          className="flex-1 h-[30px] px-2 border border-border text-[12px] outline-none"
        />
        <select value={lane} onChange={(e) => setLane(e.target.value)}
          className="h-[30px] px-1 border border-border text-[12px] bg-white">
          {LANES.map((l) => <option key={l.v} value={l.v}>{l.label}</option>)}
        </select>
      </div>

      <label className="flex items-center gap-2 text-[12px] text-muted cursor-pointer">
        <input type="checkbox" checked={tentative} onChange={(e) => setTentative(e.target.checked)} />
        Tentative (shows grey)
      </label>

      {error && <span className="text-[12px] text-accent">{error}</span>}

      <div className="flex gap-2">
        <button onClick={submit} disabled={!ready || busy}
          className="h-[30px] px-3 text-[12px] font-semibold bg-ink text-white disabled:opacity-40">
          {busy ? "Adding…" : "Publish"}
        </button>
        <button onClick={() => setOpen(false)} className="h-[30px] px-3 text-[12px] border border-border">
          Cancel
        </button>
      </div>
    </div>
  );
}
