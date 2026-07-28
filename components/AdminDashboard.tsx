"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { avatarColor, initials } from "@/lib/avatar";

type Data = {
  people: { total: number; active: number; invited: number };
  pbr: { inReview: number; doneTotal: number; doneThisWeek: number; openQuestions: number };
  pipeline: { tracked: number; handoff: Record<string, number> };
  poker: { sessions: number; estimatedItems: number };
  invited: { name: string; email: string | null; role: string }[];
  recentDone: { jiraKey: string; at: string | null }[];
  reviewerLoad: { name: string; count: number }[];
};

const HANDOFF_LABEL: Record<string, string> = {
  NOT_STARTED: "Not started", IN_ENGINE: "In Engine", ENGINE_TO_MW: "Engine → MW",
  MW_TO_FE: "MW → FE", STALLED: "Stalled", BLOCKED: "Blocked", SHIPPED: "Shipped",
};

export default function AdminDashboard() {
  const router = useRouter();
  const [d, setD] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/admin/dashboard")
      .then((r) => r.json())
      .then((data) => (data.error ? setError(data.error) : setD(data)))
      .catch((e) => setError(e.message));
  }, []);

  if (error) return <div className="p-8"><div className="border border-amberBorder bg-amberBg p-4 text-sm text-amberTextDark">{error === "forbidden" ? "Admin access required." : error}</div></div>;
  if (!d) return <div className="p-8 text-sm text-muted2 font-mono">Loading dashboard…</div>;

  const fmtDate = (iso: string | null) => iso ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : "";

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <header className="px-[30px] pt-6 pb-4 border-b border-border">
        <h1 className="m-0 text-[25px] font-semibold tracking-[-0.025em]">Admin Dashboard</h1>
        <p className="m-0 mt-[5px] text-[12.5px] text-muted">Health across PBR, pipeline, people, and estimation.</p>
      </header>

      <div className="flex-1 overflow-y-auto px-[30px] py-6 flex flex-col gap-8 max-w-[980px]">
        {/* Stat cards */}
        <div className="grid grid-cols-4 gap-3">
          <Stat label="In PBR review" value={d.pbr.inReview} sub="stories being reviewed" />
          <Stat label="PBR done" value={d.pbr.doneTotal} sub={`${d.pbr.doneThisWeek} this week`} accent />
          <Stat label="Open questions" value={d.pbr.openQuestions} sub="across all stories" />
          <Stat label="In pipeline" value={d.pipeline.tracked} sub="stories tracked" />
        </div>
        <div className="grid grid-cols-4 gap-3">
          <Stat label="People" value={d.people.total} sub={`${d.people.active} active · ${d.people.invited} invited`} />
          <Stat label="Poker sessions" value={d.poker.sessions} sub={`${d.poker.estimatedItems} stories pointed`} />
          <Stat label="Stalled handoffs" value={d.pipeline.handoff["STALLED"] || 0} sub="need attention" amber={(d.pipeline.handoff["STALLED"] || 0) > 0} />
          <Stat label="Shipped" value={d.pipeline.handoff["SHIPPED"] || 0} sub="all layers done" />
        </div>

        {/* Two-column detail */}
        <div className="grid grid-cols-2 gap-6">
          {/* Pipeline handoff breakdown */}
          <Panel title="Pipeline handoff">
            {d.pipeline.tracked === 0 ? <Empty text="No stories in the pipeline yet." /> : (
              <div className="flex flex-col">
                {Object.entries(d.pipeline.handoff).sort((a,b) => b[1]-a[1]).map(([state, count]) => (
                  <div key={state} className="flex items-center justify-between px-4 h-[36px] border-b border-borderFaint last:border-b-0">
                    <span className={`text-[12.5px] ${state === "STALLED" ? "text-amberText" : state === "SHIPPED" ? "text-good" : "text-ink"}`}>{HANDOFF_LABEL[state] || state}</span>
                    <span className="font-mono text-[12px] font-semibold">{count}</span>
                  </div>
                ))}
              </div>
            )}
          </Panel>

          {/* Reviewer load */}
          <Panel title="Open review load">
            {d.reviewerLoad.length === 0 ? <Empty text="No open review assignments." /> : (
              <div className="flex flex-col">
                {d.reviewerLoad.map((r) => (
                  <div key={r.name} className="flex items-center gap-[9px] px-4 h-[38px] border-b border-borderFaint last:border-b-0">
                    <span style={{ background: avatarColor(r.name) }} className="w-[22px] h-[22px] rounded-full text-white text-[9.5px] font-mono font-semibold flex items-center justify-center flex-none">{initials(r.name)}</span>
                    <span className="text-[12.5px] flex-1 overflow-hidden text-ellipsis whitespace-nowrap">{r.name}</span>
                    <span className="font-mono text-[11px] text-muted2">{r.count} open</span>
                  </div>
                ))}
              </div>
            )}
          </Panel>

          {/* Recently PBR done */}
          <Panel title="Recently cleared for dev">
            {d.recentDone.length === 0 ? <Empty text="Nothing marked PBR-done yet." /> : (
              <div className="flex flex-col">
                {d.recentDone.map((s) => (
                  <div key={s.jiraKey} className="flex items-center justify-between px-4 h-[36px] border-b border-borderFaint last:border-b-0">
                    <span className="font-mono text-[12px] font-medium text-key">{s.jiraKey}</span>
                    <span className="font-mono text-[10.5px] text-muted3">{fmtDate(s.at)}</span>
                  </div>
                ))}
              </div>
            )}
          </Panel>

          {/* Needs onboarding */}
          <Panel title="Not yet signed in" action={d.invited.length > 0 ? { label: "Manage people", onClick: () => router.push("/settings") } : undefined}>
            {d.invited.length === 0 ? <Empty text="Everyone invited has signed in." /> : (
              <div className="flex flex-col">
                {d.invited.map((p) => (
                  <div key={p.email || p.name} className="flex items-center gap-[9px] px-4 h-[38px] border-b border-borderFaint last:border-b-0">
                    <span className="w-[6px] h-[6px] rounded-full bg-amberText flex-none" />
                    <span className="text-[12.5px] flex-1 overflow-hidden text-ellipsis whitespace-nowrap">{p.name}</span>
                    <span className="font-mono text-[9.5px] tracking-[.05em] text-muted3">{p.role}</span>
                  </div>
                ))}
              </div>
            )}
          </Panel>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, sub, accent, amber }: { label: string; value: number; sub: string; accent?: boolean; amber?: boolean }) {
  return (
    <div className="border border-borderLight bg-white px-4 py-3 flex flex-col gap-1">
      <span className="font-mono text-[9.5px] tracking-[.1em] text-muted3">{label.toUpperCase()}</span>
      <span className={`text-[28px] font-bold leading-none ${amber ? "text-amberText" : accent ? "text-accent" : "text-ink"}`}>{value}</span>
      <span className="text-[11px] text-muted2">{sub}</span>
    </div>
  );
}

function Panel({ title, action, children }: { title: string; action?: { label: string; onClick: () => void }; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <h2 className="m-0 text-[14px] font-semibold">{title}</h2>
        {action && <button onClick={action.onClick} className="text-[11.5px] text-key hover:text-keyHover">{action.label} →</button>}
      </div>
      <div className="border border-borderLight bg-white">{children}</div>
    </section>
  );
}

function Empty({ text }: { text: string }) {
  return <div className="px-4 py-4 text-[12.5px] text-muted3">{text}</div>;
}
