"use client";

import { useState } from "react";
import PipelineBoard from "./PipelineBoard";
import SprintPlanning from "./SprintPlanning";

type Tab = "tracker" | "planning";

export default function PipelineTabs() {
  const [tab, setTab] = useState<Tab>("tracker");

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="flex items-center gap-0 px-[30px] pt-4 border-b border-border bg-paper">
        {([
          { key: "tracker", label: "Tracker" },
          { key: "planning", label: "Sprint Planning" },
        ] as { key: Tab; label: string }[]).map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`relative px-4 pb-3 pt-1 text-[13px] font-medium transition-colors ${
              tab === t.key ? "text-ink" : "text-muted2 hover:text-ink"
            }`}
          >
            {t.label}
            {tab === t.key && <span className="absolute left-0 right-0 bottom-[-1px] h-[2px] bg-accent" />}
          </button>
        ))}
      </div>
      {tab === "tracker" ? <PipelineBoard /> : <SprintPlanning />}
    </div>
  );
}
