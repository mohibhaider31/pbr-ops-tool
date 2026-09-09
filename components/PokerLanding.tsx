"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useViewer } from "@/lib/useViewer";

// Poker landing.
//
// Every number here comes from our own Postgres — poker sessions, items, votes,
// refinement flags and the outbox — with story titles from the Jira projection.
// Nothing on this page waits on Atlassian, and every stat drills through to the
// stories behind it.

type Stats = {
  live: {
    code: string; organizerName: string; startedAt: string;
    currentKey: string | null; currentSummary: string | null;
    done: number; total: number;
  } | null;
  stats: {
    estimatedThisMonth: number;
    pointsAgreed: number;
    avgRounds: number | null;
    flaggedForRefinement: number;
  };
  sessions: {
    code: string; when: string; endedAt: string | null; organizerName: string;
    stories: number; points: number; avgRounds: number | null; sync: string;
  }[];
};
type DrillRow = { jiraKey: string; summary: string; label: string; detail?: string };

function ago(iso: string) {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

export default function PokerLanding() {
  const router = useRouter();
  const { can } = useViewer();
  const [joinCode, setJoinCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<Stats | null>(null);
  const [drill, setDrill] = useState<{ title: string; rows: DrillRow[] } | null>(null);
  const [drillLoading, setDrillLoading] = useState(false);

  const canVote = can("poker_vote");

  const load = useCallback(() => {
    fetch("/api/poker/stats")
      .then((r) => r.json())
      .then((d) => !d.error && setData(d))
      .catch(() => {});
  }, []);
  useEffect(() => { load(); }, [load]);

  const create = async () => {
    setBusy(true);
    const res = await fetch("/api/poker/create", { method: "POST" });
    const d = await res.json();
    setBusy(false);
    if (d.code) router.push(`/poker/${d.code}`);
    else setError(d.error || "Could not start session");
  };

  const join = () => {
    const code = joinCode.trim().toUpperCase();
    if (code) router.push(`/poker/${code}`);
  };

  const openDrill = async (metric: string) => {
    setDrillLoading(true);
    try {
      const res = await fetch(`/api/poker/stats/${metric}`);
      const d = await res.json();
      if (!d.error) setDrill({ title: d.title, rows: d.rows ?? [] });
    } finally {
      setDrillLoading(false);
    }
  };

  const s = data?.stats;

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <header className="flex items-end justify-between gap-6 px-[30px] pt-6 pb-4 border-b border-border">
        <div className="flex flex-col gap-[6px]">
          <h1 className="m-0 text-[25px] font-semibold tracking-[-0.025em]">Planning poker</h1>
          <p className="m-0 text-[12.5px] text-muted">
            Estimate as a team, one story at a time. Accepted points sync straight to Jira.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-none">
          <div className="flex">
            <input
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
              onKeyDown={(e) => e.key === "Enter" && join()}
              placeholder="ENTER CODE"
              className="h-[38px] w-[150px] px-3 border border-border bg-white font-mono text-[13px] tracking-[.12em] outline-none focus:border-ink"
            />
            <button onClick={join} disabled={!joinCode.trim()}
              className="h-[38px] px-4 text-[13px] font-semibold border border-l-0 border-border bg-cream disabled:opacity-40">
              Join
            </button>
          </div>
          {canVote && (
            <button onClick={create} disabled={busy}
              className="h-[38px] px-4 text-[13px] font-semibold bg-accent text-white disabled:opacity-50">
              {busy ? "Creating…" : "Start a session"}
            </button>
          )}
        </div>
      </header>

      <div className="flex-1 overflow-y-auto px-[30px] py-5 flex flex-col gap-5">
        {error && (
          <div className="border border-amberBorder bg-amberBg px-3 py-2 text-[12.5px] text-amberTextDark">
            {error}
          </div>
        )}

        {/* Live session */}
        {data?.live && (
          <div className="border border-border bg-white flex items-center gap-5 pl-4 pr-4 py-4 border-l-[3px] border-l-accent">
            <span className="flex items-center gap-2 flex-none">
              <span className="w-[7px] h-[7px] rounded-full bg-accent animate-pulse" />
              <span className="font-mono text-[10px] tracking-[.14em] text-accent">LIVE NOW</span>
            </span>
            <div className="flex flex-col gap-[3px] min-w-0">
              <span className="flex items-baseline gap-3">
                <span className="font-mono text-[17px] font-bold tracking-[.14em]">{data.live.code}</span>
                <span className="text-[12.5px] text-muted2">
                  started by {data.live.organizerName} · {ago(data.live.startedAt)}
                </span>
              </span>
              <span className="text-[12.5px] text-muted truncate">
                {data.live.currentKey
                  ? `Estimating ${data.live.currentKey}`
                  : "No story on the table yet"}
                {" · "}
                {data.live.done} of {data.live.total} stories done
              </span>
            </div>
            <button
              onClick={() => router.push(`/poker/${data.live!.code}`)}
              className="ml-auto flex-none h-[38px] px-5 bg-ink text-white text-[13px] font-semibold"
            >
              Rejoin →
            </button>
          </div>
        )}

        {/* Stats — every one clickable */}
        <div className="grid grid-cols-4 gap-px bg-border border border-border">
          <Stat label="ESTIMATED THIS MONTH" value={s ? String(s.estimatedThisMonth) : "—"}
            unit="stories" onClick={() => openDrill("estimated")} />
          <Stat label="POINTS AGREED" value={s ? String(s.pointsAgreed) : "—"}
            unit="synced to Jira" tone="good" onClick={() => openDrill("points")} />
          <Stat label="AVG ROUNDS / STORY" value={s?.avgRounds != null ? String(s.avgRounds) : "—"}
            unit="lower is better" onClick={() => openDrill("rounds")} />
          <Stat label="FLAGGED FOR REFINEMENT" value={s ? String(s.flaggedForRefinement) : "—"}
            unit="sent back" tone={s && s.flaggedForRefinement > 0 ? "accent" : undefined}
            onClick={() => openDrill("flagged")} />
        </div>

        {/* Recent sessions */}
        <div className="flex flex-col gap-2">
          <div className="flex items-baseline justify-between">
            <span className="text-[15px] font-semibold">Recent sessions</span>
            <span className="font-mono text-[10px] tracking-[.1em] text-muted3">
              LAST {data?.sessions.length ?? 0} · THIS BOARD
            </span>
          </div>

          <div className="border border-borderLight">
            <div className="grid px-4 py-[7px] border-b border-border bg-cream/40 font-mono text-[9.5px] tracking-[.08em] text-muted3"
              style={{ gridTemplateColumns: "90px 1fr 70px 70px 90px 100px" }}>
              <span>CODE</span><span>WHEN</span><span className="text-right">STORIES</span>
              <span className="text-right">POINTS</span><span className="text-right">ROUNDS/STORY</span>
              <span className="text-right">SYNC</span>
            </div>
            {!data ? (
              <div className="px-4 py-3 text-[12.5px] text-muted2 font-mono">Loading…</div>
            ) : data.sessions.length === 0 ? (
              <div className="px-4 py-4 text-[12.5px] text-muted3">
                No sessions yet. Start one and it&apos;ll appear here with its estimates and sync state.
              </div>
            ) : (
              data.sessions.map((sess) => (
                <button
                  key={sess.code}
                  onClick={() => router.push(`/poker/${sess.code}`)}
                  className="w-full grid px-4 py-[11px] border-b border-borderFaint last:border-b-0 items-center text-left hover:bg-cream/50 transition-colors"
                  style={{ gridTemplateColumns: "90px 1fr 70px 70px 90px 100px" }}
                >
                  <span className="font-mono text-[12px] font-medium text-key">{sess.code}</span>
                  <span className="text-[12.5px] text-muted2 truncate">
                    {ago(sess.when)} — {sess.organizerName}
                    {!sess.endedAt && <span className="text-accent"> · live</span>}
                  </span>
                  <span className="text-[12.5px] text-right">{sess.stories}</span>
                  <span className="text-[12.5px] text-right">{sess.points}</span>
                  <span className={`text-[12.5px] text-right ${sess.avgRounds && sess.avgRounds > 1.6 ? "text-amberText" : ""}`}>
                    {sess.avgRounds ?? "—"}
                  </span>
                  <span className="text-right">
                    <span className={`font-mono text-[9.5px] tracking-[.06em] px-[6px] py-[2px] border ${
                      sess.sync === "synced"
                        ? "text-good border-good/40"
                        : sess.sync.includes("failed")
                          ? "text-accent border-accent/40"
                          : "text-amberText border-amberBorder"
                    }`}>
                      {sess.sync.toUpperCase()}
                    </span>
                  </span>
                </button>
              ))
            )}
          </div>

          <p className="m-0 text-[11.5px] text-muted3 leading-[1.5]">
            Rounds per story above 1.6 usually means the stories arrived under-refined — worth a
            look at the INVEST scores.
          </p>
        </div>
      </div>

      {/* Drill-down */}
      {(drill || drillLoading) && (
        <div className="fixed inset-0 bg-ink/40 z-[70] flex items-center justify-center p-6"
          onClick={() => setDrill(null)}>
          <div className="w-[620px] max-h-[70vh] bg-white border border-border flex flex-col"
            onClick={(e) => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-borderLight flex items-center gap-3">
              <span className="text-[15px] font-semibold">{drill?.title ?? "Loading…"}</span>
              <span className="font-mono text-[10.5px] text-muted3">{drill?.rows.length ?? 0}</span>
              <button onClick={() => setDrill(null)}
                className="ml-auto text-muted3 hover:text-ink text-[16px] leading-none">×</button>
            </div>
            <div className="overflow-y-auto">
              {drillLoading ? (
                <div className="px-5 py-4 text-[12.5px] text-muted2 font-mono">Loading…</div>
              ) : drill && drill.rows.length === 0 ? (
                <div className="px-5 py-4 text-[12.5px] text-muted3">Nothing here yet.</div>
              ) : (
                drill?.rows.map((r) => (
                  <div key={r.jiraKey + r.label}
                    className="px-5 py-[10px] border-b border-borderFaint last:border-b-0 flex items-start gap-3">
                    <span className="font-mono text-[11.5px] text-key flex-none w-[80px]">{r.jiraKey}</span>
                    <span className="flex flex-col gap-[2px] min-w-0 flex-1">
                      <span className="text-[12.5px] leading-[1.4]">{r.summary}</span>
                      {r.detail && <span className="text-[11px] text-muted3">{r.detail}</span>}
                    </span>
                    <span className="font-mono text-[11.5px] font-semibold flex-none">{r.label}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({
  label, value, unit, tone, onClick,
}: {
  label: string; value: string; unit: string;
  tone?: "good" | "accent"; onClick: () => void;
}) {
  return (
    <button onClick={onClick}
      className="bg-paper px-5 pt-[14px] pb-[15px] flex flex-col gap-[6px] text-left hover:bg-cream/60 transition-colors group">
      <span className="font-mono text-[9px] tracking-[.11em] text-muted3">{label}</span>
      <span className="flex items-baseline gap-2">
        <span className={`text-[28px] font-bold leading-none tracking-[-0.02em] ${
          tone === "good" ? "text-good" : tone === "accent" ? "text-accent" : "text-ink"
        }`}>{value}</span>
        <span className="text-[12px] text-muted2">{unit}</span>
      </span>
      <span className="font-mono text-[9px] tracking-[.06em] text-muted4 opacity-0 group-hover:opacity-100 transition-opacity">
        VIEW STORIES →
      </span>
    </button>
  );
}
