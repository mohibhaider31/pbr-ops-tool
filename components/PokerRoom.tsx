"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { avatarColor, initials } from "@/lib/avatar";
import { DECK } from "@/lib/poker";
import { usePokerChannel } from "@/lib/usePusher";
import Toast from "./Toast";
import PokerAddStories from "./PokerAddStories";

type Participant = { voterId: string; voterName: string; voted: boolean; card: string | null };
type Analysis = {
  spreadLabel: string; median: number | null; suggested: number | null;
  verdict: string; safeToAccept: boolean; average: number | null;
  mode: string | null; confidence: number | null;
  distribution: { card: string; count: number }[];
};
type Current = {
  itemId: string; jiraKey: string; summary: string;
  state: "VOTING" | "REVEALED"; round: number; finalPoints: number | null;
  myVote: string | null; participants: Participant[]; analysis: Analysis | null;
};
type QueueItem = { itemId: string; jiraKey: string; summary: string; status: "PENDING" | "DONE"; finalPoints: number | null; isCurrent: boolean };
type State = { code: string; organizerName: string; isOrganizer: boolean; queue: QueueItem[]; current: Current | null };

export default function PokerRoom({ code }: { code: string }) {
  const router = useRouter();
  const [s, setS] = useState<State | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [addOpen, setAddOpen] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch(`/api/poker/${code}`);
    if (res.status === 404) { setNotFound(true); return; }
    const data = await res.json();
    if (!data.error) setS(data);
  }, [code]);

  useEffect(() => { load(); }, [load]);
  usePokerChannel(code, {
    "vote-update": () => load(), "revealed": () => load(), "re-vote": () => load(),
    "accepted": () => load(), "queue-update": () => load(), "navigate": () => load(),
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
    setBusy(true);
    const res = await fetch(`/api/poker/${code}/item/${cur.itemId}/${path}`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined,
    });
    const d = await res.json(); setBusy(false);
    if (d.error) showToast(d.error);
    else if (path === "accept") showToast(`${body.points} pts synced to ${cur.jiraKey}`);
    load();
  };
  const goTo = async (itemId: string) => {
    setBusy(true);
    await fetch(`/api/poker/${code}/current`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ itemId }),
    });
    setBusy(false); load();
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
  if (!s) return <div className="p-8 text-sm text-muted2 font-mono">Loading session…</div>;

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
