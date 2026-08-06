"use client";

import { useCallback, useEffect, useState } from "react";
import { usePokerChannel } from "@/lib/usePusher";
import { DECK } from "@/lib/poker";

// Guest voting view. Follows the organizer's navigation via Pusher, shows the
// current story, and lets the guest pick a card. No organizer controls, no
// queue management — voting only.
export default function GuestPokerRoom({ code, name }: { code: string; name: string }) {
  const [state, setState] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

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

  useEffect(() => { load(); }, [load]);
  usePokerChannel(code, {
    "vote-update": () => load(),
    "revealed": () => load(),
    "re-vote": () => load(),
    "accepted": () => load(),
    "queue-update": () => load(),
    "navigate": () => load(),
  });

  const cur = state?.current;

  const vote = (card: string) => {
    if (!cur) return;
    setState((p: any) => (p && p.current ? { ...p, current: { ...p.current, myVote: card } } : p));
    fetch(`/api/poker/${code}/item/${cur.itemId}/vote`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ card }),
    }).catch(() => {});
  };

  if (error) {
    return (
      <div className="min-h-screen w-full bg-paper flex items-center justify-center p-6">
        <div className="max-w-[380px] border border-amberBorder bg-amberBg p-4 text-[13px] text-amberTextDark">{error}</div>
      </div>
    );
  }
  if (!state) return <div className="min-h-screen bg-paper flex items-center justify-center text-sm text-muted2 font-mono">Loading…</div>;

  const revealed = cur?.state === "REVEALED";
  const votedCount = cur?.participants?.length ?? 0;

  return (
    <div className="min-h-screen w-full bg-paper text-ink font-sans flex flex-col">
      <header className="px-6 py-4 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-[10px]">
          <span className="bg-accent text-white font-mono font-bold text-[12px] tracking-[.06em] px-[8px] py-[4px]">PBR</span>
          <span className="text-[14px] font-semibold">Planning Poker</span>
          <span className="font-mono text-[12px] text-muted2 tracking-[.1em]">· {code}</span>
        </div>
        <span className="text-[12px] text-muted2">Guest: <span className="text-ink font-medium">{name}</span></span>
      </header>

      <div className="flex-1 flex flex-col items-center justify-center p-6 gap-6">
        {!cur ? (
          <div className="text-center flex flex-col gap-2">
            <span className="text-[15px] font-semibold">Waiting for the organizer…</span>
            <p className="m-0 text-[13px] text-muted">They&apos;ll bring a story up to vote on shortly.</p>
          </div>
        ) : (
          <>
            <div className="text-center flex flex-col gap-[6px] max-w-[560px]">
              <span className="font-mono text-[12px] text-key">{cur.jiraKey}</span>
              <h1 className="m-0 text-[19px] font-semibold leading-[1.35]">{cur.summary}</h1>
              <span className="font-mono text-[11px] text-muted2 mt-1">
                {revealed ? "Revealed" : `${votedCount} voted`}{cur.round > 1 ? ` · round ${cur.round}` : ""}
              </span>
            </div>

            {revealed && cur.analysis && (
              <div className="flex items-center gap-6 border border-border bg-white px-5 py-3">
                <Stat label="Median" value={cur.analysis.median} />
                <Stat label="Average" value={cur.analysis.average} />
                <Stat label="Suggested" value={cur.analysis.suggested} accent />
              </div>
            )}

            {/* Card deck */}
            <div className="flex items-end justify-center gap-2 flex-wrap max-w-[520px]">
              {DECK.map((card) => {
                const picked = cur.myVote === card;
                return (
                  <button
                    key={card}
                    onClick={() => !revealed && vote(card)}
                    disabled={revealed}
                    className={`w-[52px] h-[72px] border font-mono text-[18px] font-bold transition-all ${
                      picked
                        ? "bg-accent text-white border-accent -translate-y-[10px] shadow-lg"
                        : "bg-white text-ink border-border hover:border-ink hover:-translate-y-[5px] disabled:opacity-40 disabled:hover:translate-y-0 disabled:hover:border-border"
                    }`}
                  >
                    {card}
                  </button>
                );
              })}
            </div>
            {revealed ? (
              <span className="text-[12.5px] text-muted2">Cards are in. Waiting for the organizer to continue.</span>
            ) : (
              <span className="text-[12.5px] text-muted2">{cur.myVote ? `You picked ${cur.myVote}. Tap another to change.` : "Tap a card to vote."}</span>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: any; accent?: boolean }) {
  return (
    <div className="flex flex-col items-center gap-[2px]">
      <span className="font-mono text-[9px] tracking-[.1em] text-muted3">{label.toUpperCase()}</span>
      <span className={`text-[20px] font-bold ${accent ? "text-accent" : "text-ink"}`}>{value}</span>
    </div>
  );
}
