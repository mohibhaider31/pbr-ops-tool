"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePokerChannel } from "@/lib/usePusher";
import { DECK } from "@/lib/poker";
import { avatarColor, initials } from "@/lib/avatar";
import RefinementPoll from "./RefinementPoll";
import InvestPoll from "./InvestPoll";

type Participant = { voterId: string; voterName: string; voted: boolean; card: string | null };
type Analysis = {
  median: number | null; suggested: number | null; average: number | null;
  verdict: string; safeToAccept: boolean; mode: string | null; confidence: number | null;
  distribution: { card: string; count: number }[]; alignmentScore: number | null;
};

// Guest voting view — now shows the same shared picture the team sees: the
// participant circle and reveal results. Still no organizer controls (no
// queue management, navigation, or accept — the organizer drives; guests
// follow via Pusher and vote only).
export default function GuestPokerRoom({ code, name }: { code: string; name: string }) {
  const [state, setState] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const reloadTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/poker/${code}`);
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Session unavailable");
      setState(d);
    } catch (e: any) {
      setError(e.message);
    }
  }, [code]);

  // Coalesce realtime bursts into one refetch (see PokerRoom for rationale).
  const debouncedLoad = useCallback(() => {
    if (reloadTimer.current) clearTimeout(reloadTimer.current);
    reloadTimer.current = setTimeout(() => load(), 250);
  }, [load]);

  useEffect(() => {
    load();
    return () => { if (reloadTimer.current) clearTimeout(reloadTimer.current); };
  }, [load]);
  usePokerChannel(code, {
    "vote-update": () => debouncedLoad(), "revealed": () => debouncedLoad(), "re-vote": () => debouncedLoad(),
    "accepted": () => debouncedLoad(), "queue-update": () => debouncedLoad(), "navigate": () => debouncedLoad(),
    "refinement-open": () => debouncedLoad(), "refinement-update": () => debouncedLoad(), "refinement-closed": () => debouncedLoad(),
    "invest-open": () => debouncedLoad(), "invest-update": () => debouncedLoad(), "invest-closed": () => debouncedLoad(),
  });

  const cur = state?.current;
  const revealed = cur?.state === "REVEALED";
  const votedCount = cur?.participants?.filter((p: Participant) => p.voted).length ?? 0;
  const total = cur?.participants?.length ?? 0;

  const R = 168;
  const seats: (Participant & { x: number; y: number })[] = (cur?.participants ?? []).map((p: Participant, i: number) => {
    const angle = (i / Math.max(total, 1)) * 2 * Math.PI - Math.PI / 2;
    return { ...p, x: Math.cos(angle) * R, y: Math.sin(angle) * R };
  });

  const vote = (card: string) => {
    if (!cur || revealed) return;
    setState((p: any) => (p && p.current ? { ...p, current: { ...p.current, myVote: card } } : p));
    fetch(`/api/poker/${code}/item/${cur.itemId}/vote`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ card }),
    }).catch(() => {});
  };

  const refinementVote = (needsWork: boolean) => {
    if (!cur) return;
    setState((p: any) => (p && p.current ? { ...p, current: { ...p.current, refinement: { ...p.current.refinement, myVote: needsWork } } } : p));
    fetch(`/api/poker/${code}/item/${cur.itemId}/refinement-vote`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ needsWork }),
    }).catch(() => {});
  };

  const investSubmit = (scores: any) => {
    if (!cur) return;
    setState((p: any) => (p && p.current ? { ...p, current: { ...p.current, invest: { ...p.current.invest, mine: scores } } } : p));
    fetch(`/api/poker/${code}/item/${cur.itemId}/invest-vote`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(scores),
    }).catch(() => {});
  };

  if (error) {
    return (
      <div className="min-h-screen w-full bg-paper flex items-center justify-center p-6">
        <div className="max-w-[380px] border border-amberBorder bg-amberBg p-4 text-[13px] text-amberTextDark">{error}</div>
      </div>
    );
  }
  if (!state) return (
    <div className="min-h-screen w-full bg-paper flex flex-col">
      <div className="px-6 py-4 border-b border-border flex items-center gap-[10px]">
        <span className="bg-accent text-white font-mono font-bold text-[12px] tracking-[.06em] px-[8px] py-[4px]">PBR</span>
        <div className="h-[10px] w-[120px] bg-borderLight animate-pulse" />
      </div>
      <div className="flex-1 flex items-center justify-center">
        <div className="relative" style={{ width: 440, height: 440 }}>
          <div className="absolute rounded-full bg-borderLight animate-pulse" style={{ width: 232, height: 232, left: 104, top: 104 }} />
        </div>
      </div>
      <div className="border-t border-borderLight px-6 py-4 flex justify-center gap-2">
        {Array.from({ length: 8 }).map((_, i) => <div key={i} className="w-[46px] h-[62px] bg-borderLight animate-pulse" />)}
      </div>
    </div>
  );

  const a: Analysis | null = cur?.analysis ?? null;

  return (
    <div className="min-h-screen w-full bg-paper text-ink font-sans flex flex-col">
      <header className="px-6 py-4 border-b border-border flex items-center justify-between flex-none">
        <div className="flex items-center gap-[10px]">
          <span className="bg-accent text-white font-mono font-bold text-[12px] tracking-[.06em] px-[8px] py-[4px]">PBR</span>
          <span className="text-[14px] font-semibold">Planning Poker</span>
          <span className="font-mono text-[12px] text-muted2 tracking-[.1em]">· {code}</span>
        </div>
        <span className="text-[12px] text-muted2">Guest: <span className="text-ink font-medium">{name}</span></span>
      </header>

      {!cur ? (
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="text-center flex flex-col gap-2">
            <span className="text-[15px] font-semibold">Waiting for the organizer…</span>
            <p className="m-0 text-[13px] text-muted">They&apos;ll bring a story up to vote on shortly.</p>
          </div>
        </div>
      ) : (
        <>
          {/* story bar */}
          <div className="px-[26px] py-3 border-b border-borderLight flex items-center gap-3 flex-none">
            <span className="font-mono text-[12px] font-bold text-key">{cur.jiraKey}</span>
            <span className="text-[14px] font-medium truncate">{cur.summary}</span>
            <span className="ml-auto font-mono text-[9.5px] tracking-[.08em] border border-border px-[7px] py-[3px] text-muted2">ROUND {cur.round}</span>
            {revealed
              ? <span className="font-mono text-[9.5px] tracking-[.08em] border border-good/40 text-good px-[7px] py-[3px]">REVEALED</span>
              : <span className="font-mono text-[9.5px] tracking-[.08em] border border-key/40 text-key px-[7px] py-[3px]">VOTING</span>}
          </div>

          <div className="flex-1 overflow-y-auto flex min-h-0 flex-col lg:flex-row">
            {/* table */}
            <div className="flex-1 flex items-center justify-center relative py-6 min-w-0">
              <div className="relative" style={{ width: 440, height: 440 }}>
                <div className="absolute rounded-full bg-ink flex flex-col items-center justify-center" style={{ width: 232, height: 232, left: 104, top: 104 }}>
                  {revealed && a ? (
                    <>
                      <span className="font-mono text-[9px] tracking-[.14em] text-railMuted">MOST VOTES</span>
                      <span className="text-[52px] font-bold text-white leading-none mt-1">{a.mode ?? "–"}</span>
                      <span className="font-mono text-[10px] text-railMuted mt-2">suggested {a.suggested ?? "–"}</span>
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

            {/* stats (after reveal) */}
            {revealed && a && (
              <div className="w-full lg:w-[280px] flex-none border-t lg:border-t-0 lg:border-l border-borderLight p-5 flex flex-col gap-4">
                <div className="flex flex-col items-center gap-1">
                  <span className="text-[34px] font-bold leading-none">{a.mode ?? "–"}</span>
                  <span className="text-[13px] font-semibold text-muted">Most Votes</span>
                </div>
                <div className="flex flex-col gap-[6px]">
                  <Row label="Average" value={a.average != null ? a.average.toFixed(2) : "–"} />
                  <Row label="Median" value={a.median != null ? String(a.median) : "–"} />
                  <Row label="Confidence" value={a.confidence != null ? `${a.confidence}%` : "–"} />
                  <Row label="Alignment" value={a.alignmentScore != null ? `${a.alignmentScore}/5` : "–"} />
                </div>
                <div className="flex flex-col gap-1">
                  {a.distribution.map((d) => (
                    <div key={d.card} className="flex items-center gap-2 text-[11.5px]">
                      <span className="font-mono w-[20px] text-muted2">{d.card}</span>
                      <div className="flex-1 bg-cream h-[6px]"><div className="bg-ink h-full" style={{ width: `${(d.count / Math.max(total, 1)) * 100}%` }} /></div>
                      <span className="font-mono text-muted3 w-[16px] text-right">{d.count}</span>
                    </div>
                  ))}
                </div>
                <p className={`m-0 text-[12px] leading-[1.5] ${a.safeToAccept ? "text-good" : "text-amberText"}`}>{a.verdict}</p>
                <p className="m-0 text-[11px] text-muted3">The organizer will accept the final estimate.</p>
              </div>
            )}
          </div>

          {/* deck */}
          <div className="border-t border-borderLight px-6 py-4 flex flex-col items-center gap-3 flex-none">
            <div className="flex items-end justify-center gap-2 flex-wrap">
              {DECK.map((card) => {
                const picked = cur.myVote === card;
                return (
                  <button
                    key={card}
                    onClick={() => vote(card)}
                    disabled={revealed}
                    className={`w-[46px] h-[62px] border font-mono text-[16px] font-bold transition-all ${
                      picked
                        ? "bg-accent text-white border-accent -translate-y-[9px] shadow-lg"
                        : "bg-white text-ink border-border hover:border-ink hover:-translate-y-[4px] disabled:opacity-40 disabled:hover:translate-y-0 disabled:hover:border-border"
                    }`}
                  >
                    {card}
                  </button>
                );
              })}
            </div>
            <span className="text-[12.5px] text-muted2">
              {revealed ? "Cards are in — waiting for the organizer to continue." : cur.myVote ? `You picked ${cur.myVote}. Tap another to change.` : "Tap a card to vote."}
            </span>
          </div>
        </>
      )}
      {cur && cur.refinement && cur.refinement.open && (
        <RefinementPoll
          refinement={cur.refinement}
          jiraKey={cur.jiraKey}
          isOrganizer={false}
          onVote={refinementVote}
          onClose={() => {}}
        />
      )}
      {cur && cur.invest && cur.invest.open && (
        <InvestPoll
          invest={cur.invest}
          jiraKey={cur.jiraKey}
          summary={cur.summary}
          isOrganizer={false}
          onSubmit={investSubmit}
          onClose={() => {}}
        />
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-[12.5px]">
      <span className="text-muted2">{label}</span>
      <span className="font-mono font-semibold">{value}</span>
    </div>
  );
}
