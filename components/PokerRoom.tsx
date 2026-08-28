"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { avatarColor, initials } from "@/lib/avatar";
import { DECK } from "@/lib/poker";
import { usePokerChannel } from "@/lib/usePusher";
import Toast from "./Toast";
import { useSync } from "./SyncProvider";
import RefinementPoll from "./RefinementPoll";
import InvestPoll from "./InvestPoll";
import PokerAddStories from "./PokerAddStories";

type Participant = { voterId: string; voterName: string; voted: boolean; card: string | null };
type Analysis = {
  spreadLabel: string; median: number | null; suggested: number | null;
  verdict: string; safeToAccept: boolean; average: number | null;
  mode: string | null; confidence: number | null; alignmentScore: number | null;
  distribution: { card: string; count: number }[];
};
type Refinement = { open: boolean; myVote: boolean | null; voted: number; yes: number; score: number | null };
type InvestMine = { independent: boolean; negotiable: boolean; valuable: boolean; estimable: boolean; small: boolean; testable: boolean };
type Invest = { open: boolean; submitted: number; score: number | null; mine: InvestMine | null };
type Current = {
  itemId: string; jiraKey: string; summary: string;
  state: "VOTING" | "REVEALED"; round: number; finalPoints: number | null;
  myVote: string | null; participants: Participant[]; analysis: Analysis | null;
  refinement: Refinement;
  invest: Invest;
};
type QueueItem = { itemId: string; jiraKey: string; summary: string; status: "PENDING" | "DONE"; finalPoints: number | null; isCurrent: boolean };
type State = { code: string; organizerName: string; isOrganizer: boolean; queue: QueueItem[]; current: Current | null };

export default function PokerRoom({ code }: { code: string }) {
  const router = useRouter();
  const { run } = useSync();
  const [s, setS] = useState<State | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const reloadTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    try {
      setSyncing(true);
      const res = await fetch(`/api/poker/${code}`);
      if (res.status === 404) { setNotFound(true); return; }
      const data = await res.json();
      if (!data.error) setS(data);
    } finally {
      setSyncing(false);
    }
  }, [code]);

  // Coalesce bursts of realtime events (many people voting at once fire many
  // vote-update events) into a single refetch, instead of one full reload per
  // event. This was the main source of poker slowness.
  const debouncedLoad = useCallback(() => {
    if (reloadTimer.current) clearTimeout(reloadTimer.current);
    reloadTimer.current = setTimeout(() => load(), 250);
  }, [load]);

  useEffect(() => {
    load();
    return () => { if (reloadTimer.current) clearTimeout(reloadTimer.current); };
  }, [load]);

  usePokerChannel(code, {
    // Vote updates are high-frequency → debounced. State-change events refresh
    // promptly (still via debounce, which collapses duplicates harmlessly).
    "vote-update": () => debouncedLoad(),
    "revealed": () => debouncedLoad(),
    "re-vote": () => debouncedLoad(),
    "accepted": () => debouncedLoad(),
    "queue-update": () => debouncedLoad(),
    "navigate": () => debouncedLoad(),
    "refinement-open": () => debouncedLoad(),
    "refinement-update": () => debouncedLoad(),
    "refinement-closed": () => debouncedLoad(),
    "invest-open": () => debouncedLoad(),
    "invest-update": () => debouncedLoad(),
    "invest-closed": () => debouncedLoad(),
  });

  const showToast = (m: string) => { setToast(m); setTimeout(() => setToast(null), 2600); };
  const cur = s?.current || null;

  const vote = (card: string) => {
    if (!cur) return;
    // Instant, optimistic: reflect the pick immediately and fire the request
    // in the background. We don't block the deck or force a reload — Pusher
    // notifies everyone else, and our own state already shows the pick.
    setS((p) => (p && p.current ? { ...p, current: { ...p.current, myVote: card } } : p));
    fetch(`/api/poker/${code}/item/${cur.itemId}/vote`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ card }),
    }).catch(() => showToast("Vote didn't save — check your connection"));
  };
  const act = async (path: string, body?: any) => {
    if (!cur) return;

    // "accept" writes story points to Jira (slow). Make it optimistic: mark
    // the item done in the UI immediately and sync in the background with a
    // visible status. reveal/revote are DB-only and fast, so keep them inline.
    if (path === "accept") {
      const itemId = cur.itemId;
      const jiraKey = cur.jiraKey;
      const points = body?.points;
      // Optimistically reflect acceptance in the queue + advance.
      setS((p) => {
        if (!p) return p;
        const queue = p.queue.map((q: any) => (q.itemId === itemId ? { ...q, status: "DONE", finalPoints: points } : q));
        return { ...p, queue, current: p.current ? { ...p.current, finalPoints: points } : p.current };
      });
      run(`${points} pts → ${jiraKey}`, async () => {
        const res = await fetch(`/api/poker/${code}/item/${itemId}/accept`, {
          method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ points }),
        });
        const d = await res.json().catch(() => ({}));
        if (!res.ok || d.error) throw new Error(d.error || "accept failed");
        load();
      });
      return;
    }

    setBusy(true);
    const res = await fetch(`/api/poker/${code}/item/${cur.itemId}/${path}`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined,
    });
    const d = await res.json(); setBusy(false);
    if (d.error) showToast(d.error);
    load();
  };
  const goTo = async (itemId: string) => {
    setBusy(true);
    await fetch(`/api/poker/${code}/current`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ itemId }),
    });
    setBusy(false); load();
  };

  const refinementVote = (needsWork: boolean) => {
    if (!cur) return;
    setS((p) => (p && p.current ? { ...p, current: { ...p.current, refinement: { ...p.current.refinement, myVote: needsWork } } } : p));
    fetch(`/api/poker/${code}/item/${cur.itemId}/refinement-vote`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ needsWork }),
    }).catch(() => {});
  };
  const refinementClose = async () => {
    if (!cur) return;
    await fetch(`/api/poker/${code}/item/${cur.itemId}/refinement-close`, { method: "POST" });
    load();
  };
  const investSubmit = (scores: any) => {
    if (!cur) return;
    setS((p) => (p && p.current ? { ...p, current: { ...p.current, invest: { ...p.current.invest, mine: scores } } } : p));
    fetch(`/api/poker/${code}/item/${cur.itemId}/invest-vote`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(scores),
    }).catch(() => {});
  };
  const investClose = async () => {
    if (!cur) return;
    await fetch(`/api/poker/${code}/item/${cur.itemId}/invest-close`, { method: "POST" });
    load();
  };

  const endSession = async () => {
    if (!window.confirm("End this session for everyone? This clears the room and can't be undone.")) return;
    await fetch(`/api/poker/${code}/end`, { method: "POST" });
    router.push("/poker");
  };

  if (notFound) return (
    <div className="flex-1 flex items-center justify-center p-8">
      <div className="border border-dashed border-border bg-cream px-8 py-10 text-center max-w-[420px]">
        <span className="text-[15px] font-semibold">Session not found</span>
        <p className="m-0 mt-2 text-[13px] text-muted">That code doesn&apos;t match an active session.</p>
        <button onClick={() => router.push("/poker")} className="mt-4 h-[36px] px-4 text-[13px] font-semibold bg-ink text-white">Back to Poker</button>
      </div>
    </div>
  );
  if (!s) return (
    <div className="flex-1 flex overflow-hidden">
      {/* Queue sidebar skeleton */}
      <div className="w-[240px] flex-none border-r border-border bg-cream/40 flex flex-col">
        <div className="px-4 pt-4 pb-3 border-b border-borderLight">
          <div className="h-[9px] w-[50px] bg-borderLight animate-pulse" />
        </div>
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="px-4 py-[10px] border-b border-borderFaint flex flex-col gap-2">
            <div className="h-[9px] w-[54px] bg-borderLight animate-pulse" />
            <div className="h-[9px] bg-borderLight animate-pulse" style={{ width: `${60 + ((i * 11) % 30)}%` }} />
          </div>
        ))}
      </div>
      {/* Table skeleton */}
      <div className="flex-1 flex flex-col">
        <div className="px-[26px] py-3 border-b border-borderLight flex items-center gap-3">
          <div className="h-[11px] w-[60px] bg-borderLight animate-pulse" />
          <div className="h-[11px] w-[240px] bg-borderLight animate-pulse" />
        </div>
        <div className="flex-1 flex items-center justify-center">
          <div className="relative" style={{ width: 440, height: 440 }}>
            <div className="absolute rounded-full bg-borderLight animate-pulse" style={{ width: 232, height: 232, left: 104, top: 104 }} />
            {Array.from({ length: 6 }).map((_, i) => {
              const angle = (i / 6) * 2 * Math.PI - Math.PI / 2;
              const x = Math.cos(angle) * 168, y = Math.sin(angle) * 168;
              return (
                <div key={i} className="absolute flex flex-col items-center gap-1" style={{ left: 220 + x - 28, top: 220 + y - 40, width: 56 }}>
                  <div className="w-[30px] h-[42px] bg-borderLight animate-pulse" />
                  <div className="w-[34px] h-[34px] rounded-full bg-borderLight animate-pulse" />
                </div>
              );
            })}
          </div>
        </div>
        <div className="px-6 py-4 border-t border-borderLight flex justify-center gap-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="w-[46px] h-[62px] bg-borderLight animate-pulse" />
          ))}
        </div>
      </div>
    </div>
  );

  const revealed = cur?.state === "REVEALED";
  const votedCount = cur?.participants.filter((p) => p.voted).length ?? 0;
  const total = cur?.participants.length ?? 0;

  const R = 168;
  const seats = (cur?.participants ?? []).map((p, i) => {
    const angle = (i / Math.max(total, 1)) * 2 * Math.PI - Math.PI / 2;
    return { ...p, x: Math.cos(angle) * R, y: Math.sin(angle) * R };
  });

  return (
    <div className="flex-1 flex overflow-hidden">
      {/* Queue sidebar */}
      <div className="w-[240px] flex-none border-r border-border flex flex-col overflow-hidden bg-cream/40">
        <div className="px-4 pt-4 pb-3 border-b border-borderLight flex items-center justify-between">
          <span className="font-mono text-[10px] tracking-[.11em] text-muted2">QUEUE</span>
          {s.isOrganizer && (
            <button onClick={() => setAddOpen(true)} className="text-[12px] font-medium text-key hover:text-keyHover">+ Add</button>
          )}
        </div>
        <div className="flex-1 overflow-y-auto">
          {s.queue.length === 0 && (
            <div className="px-4 py-4 text-[12px] text-muted3">
              {s.isOrganizer ? "Add stories to start estimating." : "Waiting for the organizer to add stories."}
            </div>
          )}
          {s.queue.map((q) => (
            <button
              key={q.itemId}
              onClick={() => s.isOrganizer && goTo(q.itemId)}
              disabled={!s.isOrganizer}
              className={`w-full text-left px-4 py-[10px] border-b border-borderFaint transition-colors ${
                q.isCurrent ? "bg-white" : "hover:bg-white/60"
              } ${s.isOrganizer ? "cursor-pointer" : "cursor-default"}`}
            >
              <div className="flex items-center gap-2">
                {q.isCurrent && <span className="w-[2px] h-[13px] bg-accent flex-none" />}
                <span className="font-mono text-[11px] font-medium text-key">{q.jiraKey}</span>
                {q.status === "DONE" && <span className="ml-auto font-mono text-[10px] text-good">✓ {q.finalPoints}</span>}
              </div>
              <div className="text-[12px] text-ink mt-[2px] overflow-hidden text-ellipsis whitespace-nowrap">{q.summary}</div>
            </button>
          ))}
        </div>
        <div className="px-4 py-3 border-t border-borderLight">
          <span className="font-mono text-[9px] tracking-[.1em] text-muted3">
            {s.queue.filter((q) => q.status === "DONE").length}/{s.queue.length} DONE
          </span>
        </div>
      </div>

      {/* Main area */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        <header className="px-[26px] pt-4 pb-3 border-b border-border flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <span className="font-mono text-[10px] tracking-[.11em] text-muted3">SESSION</span>
            <button
              onClick={() => { navigator.clipboard?.writeText(s.code); showToast("Code copied"); }}
              className="font-mono text-[18px] font-bold tracking-[.12em] text-ink hover:text-accent"
              title="Copy invite code"
            >{s.code}</button>
            <span className="text-[11.5px] text-muted2">· {s.organizerName}</span>
            {syncing && <span className="w-[6px] h-[6px] rounded-full bg-key/50 animate-pulse flex-none" title="Syncing…" />}
          </div>
          <div className="flex items-center gap-2 flex-none">
            <button
              onClick={() => {
                const url = `${window.location.origin}/poker-guest`;
                navigator.clipboard?.writeText(url);
                showToast(`Guest link copied — share it with the code ${s.code}`);
              }}
              className="text-[12px] text-muted2 hover:text-key border border-border hover:border-key px-3 h-[30px] transition-colors"
              title="Copy a link for guests (they join with the session code, vote only)"
            >
              Guest link
            </button>
            {s.isOrganizer && (
              <button
                onClick={endSession}
                className="text-[12px] text-muted2 hover:text-accent border border-border hover:border-accent px-3 h-[30px] transition-colors"
              >
                End session
              </button>
            )}
          </div>
        </header>

        {!cur ? (
          <div className="flex-1 flex items-center justify-center p-8">
            <div className="text-center max-w-[380px]">
              <span className="text-[15px] font-semibold">No story selected</span>
              <p className="m-0 mt-2 text-[13px] text-muted">
                {s.isOrganizer ? "Add stories to the queue and pick one to start." : `Waiting for ${s.organizerName} to start a story.`}
              </p>
              {s.isOrganizer && s.queue.length === 0 && (
                <button onClick={() => setAddOpen(true)} className="mt-4 h-[38px] px-4 text-[13px] font-semibold bg-accent text-white">+ Add stories</button>
              )}
            </div>
          </div>
        ) : (
          <>
            {/* story bar */}
            <div className="px-[26px] py-3 border-b border-borderLight flex items-center gap-3">
              <span className="font-mono text-[12px] font-bold text-key">{cur.jiraKey}</span>
              <span className="text-[14px] font-medium truncate">{cur.summary}</span>
              <span className="ml-auto font-mono text-[9.5px] tracking-[.08em] border border-border px-[7px] py-[3px] text-muted2">ROUND {cur.round}</span>
              {revealed
                ? <span className="font-mono text-[9.5px] tracking-[.08em] border border-good/40 text-good px-[7px] py-[3px]">REVEALED</span>
                : <span className="font-mono text-[9.5px] tracking-[.08em] border border-key/40 text-key px-[7px] py-[3px]">VOTING</span>}
            </div>

            <div className="flex-1 overflow-y-auto flex min-h-0">
              {/* table */}
              <div className="flex-1 flex items-center justify-center relative py-6 min-w-0">
                <div className="relative" style={{ width: 440, height: 440 }}>
                  <div className="absolute rounded-full bg-ink flex flex-col items-center justify-center" style={{ width: 232, height: 232, left: 104, top: 104 }}>
                    {revealed && cur.analysis ? (
                      <>
                        <span className="font-mono text-[9px] tracking-[.14em] text-railMuted">MOST VOTES</span>
                        <span className="text-[52px] font-bold text-white leading-none mt-1">{cur.analysis.mode ?? "–"}</span>
                        <span className="font-mono text-[10px] text-railMuted mt-2">suggested {cur.analysis.suggested ?? "–"}</span>
                      </>
                    ) : (
                      <>
                        <span className="text-[34px] font-bold text-white leading-none">{votedCount}<span className="text-railMuted text-[20px]">/{total || 0}</span></span>
                        <span className="font-mono text-[9px] tracking-[.14em] text-railMuted mt-2">VOTED</span>
                      </>
                    )}
                  </div>
                  {seats.map((p) => (
                    <div key={p.voterId} className="absolute flex flex-col items-center gap-1" style={{ left: 220 + p.x - 28, top: 220 + p.y - 40, width: 56 }}>
                      <div className={`w-[30px] h-[42px] flex items-center justify-center font-mono font-bold text-[14px] border transition-all ${
                        revealed ? "bg-white text-ink border-border" : p.voted ? "bg-ink border-ink" : "bg-white border-dashed border-border"
                      }`}>{revealed ? (p.card ?? "–") : ""}</div>
                      <span style={{ background: avatarColor(p.voterId) }} className="w-[34px] h-[34px] rounded-full text-white text-[11px] font-mono font-semibold flex items-center justify-center border-2 border-paper">{initials(p.voterName)}</span>
                      <span className="text-[10.5px] font-medium text-center leading-tight max-w-[60px] truncate">{p.voterName}</span>
                    </div>
                  ))}
                  {total === 0 && <div className="absolute inset-0 flex items-end justify-center"><span className="text-[12px] text-muted3 pb-2">No votes yet</span></div>}
                </div>
              </div>

              {/* stats */}
              {revealed && cur.analysis && (
                <aside className="w-[230px] flex-none border-l border-border p-5 flex flex-col gap-4 overflow-y-auto">
                  <div className="flex items-baseline gap-2">
                    <span className="text-[34px] font-bold leading-none">{cur.analysis.mode ?? "–"}</span>
                    <span className="text-[13px] font-semibold text-muted">Most Votes</span>
                  </div>
                  <div className="flex flex-col gap-[8px] text-[12.5px]">
                    <Row label="Voted" value={`${votedCount}/${total}`} />
                    <Row label="Average" value={cur.analysis.average != null ? cur.analysis.average.toFixed(2) : "–"} />
                    <Row label="Median" value={cur.analysis.median != null ? String(cur.analysis.median) : "–"} />
                    <Row label="Confidence" value={cur.analysis.confidence != null ? `${cur.analysis.confidence}%` : "–"} />
                    <Row label="Alignment" value={cur.analysis.alignmentScore != null ? `${cur.analysis.alignmentScore}/5` : "–"} />
                  </div>
                  <div className="flex flex-col gap-[5px]">
                    {cur.analysis.distribution.map((d) => (
                      <div key={d.card} className="flex items-center gap-2">
                        <span className="font-mono text-[11px] text-muted2 w-[24px]">{d.count}x</span>
                        <span className="w-[26px] h-[28px] flex items-center justify-center border border-border bg-white font-mono text-[12px] font-bold">{d.card}</span>
                      </div>
                    ))}
                  </div>
                  <p className={`m-0 text-[12px] leading-[1.5] ${cur.analysis.safeToAccept ? "text-good" : "text-amberText"}`}>{cur.analysis.verdict}</p>
                </aside>
              )}
            </div>

            {/* bottom controls */}
            <div className="border-t border-border px-[26px] py-3">
              {cur.finalPoints != null ? (
                <div className="flex items-center gap-3">
                  <span className="border border-good/40 bg-[#EAF6EF] px-3 py-2 text-[12.5px] text-good font-medium">✓ {cur.finalPoints} synced to {cur.jiraKey}</span>
                  {s.isOrganizer && <span className="text-[12px] text-muted3">Pick the next story from the queue →</span>}
                </div>
              ) : !revealed ? (
                <div className="flex items-end justify-between gap-4">
                  <div className="flex items-end gap-[5px]">
                    {DECK.map((card, i) => {
                      const picked = cur.myVote === card;
                      return (
                        <button key={card} onClick={() => vote(card)}
                          className={`w-[42px] h-[58px] border font-mono text-[16px] font-bold transition-all ${picked ? "bg-accent text-white border-accent -translate-y-[9px] shadow-lg" : "bg-white text-ink border-border hover:border-ink hover:-translate-y-[4px]"}`}
                          style={{ transform: picked ? undefined : `rotate(${(i - (DECK.length - 1) / 2) * 2}deg)` }}>{card}</button>
                      );
                    })}
                  </div>
                  <div className="flex items-center gap-3">
                    {cur.myVote && <span className="text-[12px] text-muted">Picked {cur.myVote}</span>}
                    {s.isOrganizer && <button onClick={() => act("reveal")} disabled={busy || votedCount === 0} className="h-[38px] px-5 text-[13px] font-semibold bg-accent text-white disabled:opacity-40">Reveal</button>}
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-3 flex-wrap">
                  {s.isOrganizer ? (
                    <>
                      <button onClick={() => act("revote")} disabled={busy} className="h-[38px] px-4 text-[13px] font-semibold bg-white border border-border text-muted hover:border-ink">Re-vote (round {cur.round + 1})</button>
                      {cur.analysis?.suggested != null && <button onClick={() => act("accept", { points: cur.analysis!.suggested })} disabled={busy} className="h-[38px] px-5 text-[13px] font-semibold bg-ink text-white">Accept {cur.analysis.suggested} &amp; sync to Jira</button>}
                    </>
                  ) : <span className="text-[12px] text-muted3">Waiting for {s.organizerName} to accept or re-vote.</span>}
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {addOpen && (
        <PokerAddStories
          code={code}
          existingKeys={s.queue.map((q) => q.jiraKey)}
          onClose={() => setAddOpen(false)}
          onAdded={(n) => { setAddOpen(false); showToast(`Added ${n} ${n === 1 ? "story" : "stories"}`); load(); }}
        />
      )}
      {cur && cur.refinement && cur.refinement.open && (
        <RefinementPoll
          refinement={cur.refinement}
          jiraKey={cur.jiraKey}
          isOrganizer={s.isOrganizer}
          onVote={refinementVote}
          onClose={refinementClose}
        />
      )}
      {cur && cur.invest && cur.invest.open && (
        <InvestPoll
          invest={cur.invest}
          jiraKey={cur.jiraKey}
          isOrganizer={s.isOrganizer}
          onSubmit={investSubmit}
          onClose={investClose}
        />
      )}
      {toast && <Toast message={toast} />}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between border-b border-borderFaint pb-[5px]">
      <span className="text-muted">{label}</span>
      <span className="font-mono font-semibold text-ink">{value}</span>
    </div>
  );
}
