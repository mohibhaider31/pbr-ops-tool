"use client";

import { useState } from "react";
import PeopleSettings from "./PeopleSettings";
import SecurityPanel from "./SecurityPanel";

const TABS = [
  { key: "people", label: "People" },
  { key: "security", label: "Security" },
] as const;

export default function SettingsTabs() {
  const [tab, setTab] = useState<"people" | "security">("people");

  // People has its own full-height layout with a header, so render it as-is.
  if (tab === "people") {
    return (
      <div className="flex-1 flex flex-col overflow-hidden">
        <TabBar tab={tab} setTab={setTab} />
        <PeopleSettings />
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <TabBar tab={tab} setTab={setTab} />
      <div className="flex-1 overflow-y-auto px-[30px] py-6">
        <SecurityPanel />
      </div>
    </div>
  );
}

function TabBar({
  tab,
  setTab,
}: {
  tab: string;
  setTab: (t: "people" | "security") => void;
}) {
  return (
    <div className="flex gap-1 px-[30px] pt-5 border-b border-border">
      {TABS.map((t) => (
        <button
          key={t.key}
          onClick={() => setTab(t.key)}
          className={`px-4 h-[34px] text-[13px] font-semibold border-b-2 -mb-px transition-colors ${
            tab === t.key
              ? "border-accent text-ink"
              : "border-transparent text-muted2 hover:text-ink"
          }`}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}
