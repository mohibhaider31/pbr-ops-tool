"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { avatarColor, initials } from "@/lib/avatar";
import { DECK } from "@/lib/poker";
import { usePokerChannel } from "@/lib/usePusher";
import Toast from "./Toast";

type Participant = { voterId: string; voterName: string; voted: boolean; card: string | null };
type Analysis = {
  spreadLabel: string;
  median: number | null;
  suggested: number | null;
  verdict: string;
  safeToAccept: boolean;
  average: number | null;
  mode: string | null;
  confidence: number | null;
  distribution: { card: string; count: number }[];
};
type State = {
  code: string;
  jiraKey: string;
  summary: string;
  organizerName: string;
  state: "VOTING" | "REVEALED";
  round: number;
  finalPoints: number | null;
  isOrganizer: boolean;
  myVote: string | null;
  participants: Participant[];
  analysis: Analysis | null;
};

export default function PokerRoom({ code }: { code: string }) {
  const router = useRouter();
  const [s, setS] = useState<State | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch(`/api/poker/${code}`);
    if (res.status === 404) { setNotFound(true); return; }
    const data = await res.json();
    if (!data.error) setS(data);
  }, [code]);

  useEffect(() => { load(); }, [load]);

  usePokerChannel(code, {
    "vote-update": () => load(),
    "revealed": () => load(),
    "re-vote": () => load(),
    "accepted": () => load(),
  });

  const showToast = (m: string) => { setToast(m); setTimeout(() => setToast(null), 2600); };

  const vote = async (card: string) => {
    setBusy(true);
    setS((prev) => prev ? { ...prev, myVote: card } : prev);
    const res = await fetch(`/api/poker/${code}/vote`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ card }),
    });
    setBusy(false);
    if (!res.ok) { const d = await res.json(); showToast(d.error || "Vote failed"); }
    load();
  };
  const reveal = async () => { setBusy(true); await fetch(`/api/poker/${code}/reveal`, { method: "POST" }); setBusy(false); load(); };
  const revote = async () => { setBusy(true); await fetch(`/api/poker/${code}/revote`, { method: "POST" }); setBusy(false); load(); };
  const accept = async (points: number) => {
    setBusy(true);
    const res = await fetch(`/api/poker/${code}/accept`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ points }),
    });
    const d = await res.json();
    setBusy(false);
    if (d.error) showToast(d.error); else showToast(`${points} pts synced to ${s?.jiraKey}`);
    load();
  };

  if (notFound) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="border border-dashed border-border bg-cream px-8 py-10 text-center max-w-[420px]">
          <span className="text-[15px] font-semibold">Session not found</span>
          <p className="m-0 mt-2 text-[13px] text-muted">That invite code doesn&apos;t match an active session.</p>
          <button onClick={() => router.push("/poker")} className="mt-4 h-[36px] px-4 text-[13px] font-semibold bg-ink text-white">Back to Poker</button>
        </div>
      </div>
    );
  }
  if (!s) return <div className="p-8 text-sm text-muted2 font-mono">Loading session…</div>;

  const revealed = s.state === "REVEALED";
  const votedCount = s.participants.filter((p) => p.voted).length;
  const total = s.participants.length;

  // Position participants evenly around a ring.
  const R = 200; // ring radius
  const seats = s.participants.map((p, i) => {
    const angle = (i / Math.max(total, 1)) * 2 * Math.PI - Math.PI / 2; // start at top
    return { ...p, x: Math.cos(angle) * R, y: Math.sin(angle) * R };
  });

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Header */}
      <header className="px-[30px] pt-5 pb-4 border-b border-border flex items-start justify-between gap-6">
        <div className="flex flex-col gap-[6px] min-w-0">
          <div className="flex items-center gap-[10px]">
            <span className="font-mono text-[12px] font-bold text-key">{s.jiraKey}</span>
            <span className="font-mono text-[9.5px] tracking-[.08em] border border-border px-[7px] py-[3px] text-muted2">ROUND {s.round}</span>
            {revealed
              ? <span className="font-mono text-[9.5px] tracking-[.08em] border border-good/40 text-good px-[7px] py-[3px]">REVEALED</span>
              : <span className="font-mono text-[9.5px] tracking-[.08em] border border-key/40 text-key px-[7px] py-[3px]">VOTING</span>}
          </div>
          <h1 className="m-0 text-[19px] font-semibold tracking-[-0.02em] leading-[1.3]">{s.summary}</h1>
          <span className="text-[11.5px] text-muted2">Organized by {s.organizerName}</span>
        </div>
        <div className="flex flex-col items-end gap-1 flex-none">
          <span className="font-mono text-[10px] tracking-[.11em] text-muted3">INVITE CODE</span>
          <button
            onClick={() => { navigator.clipboard?.writeText(s.code); showToast("Code copied"); }}
            className="font-mono text-[22px] font-bold tracking-[.14em] text-ink hover:text-accent transition-colors"
            title="Click to copy"
          >{s.code}</button>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto flex">
        {/* Table area */}
        <div className="flex-1 flex items-center justify-center relative py-8 min-h-[520px]">
          <div className="relative" style={{ width: 520, height: 520 }}>
            {/* Center table */}
            <div
              className="absolute rounded-full bg-ink flex flex-col items-center justify-center"
              style={{ width: 280, height: 280, left: 120, top: 120 }}
            >
              {revealed && s.analysis ? (
                <>
                  <span className="font-mono text-[10px] tracking-[.14em] text-railMuted">MOST VOTES</span>
                  <span className="text-[64px] font-bold text-white leading-none mt-1">{s.analysis.mode ?? "–"}</span>
                  <span className="font-mono text-[11px] text-railMuted mt-2">suggested {s.analysis.suggested ?? "–"}</span>
                </>
              ) : (
                <>
                  <span className="text-[40px] font-bold text-white leading-none">{votedCount}<span className="text-railMuted text-[24px]">/{total || 0}</span></span>
                  <span className="font-mono text-[10px] tracking-[.14em] text-railMuted mt-2">VOTED</span>
                  {votedCount > 0 && !revealed && <span className="text-[11px] text-railMuted2 mt-3 animate-pulseDot">waiting to reveal…</span>}
                </>
              )}
            </div>

            {/* Seats */}
            {seats.map((p) => (
              <div
                key={p.voterId}
                className="absolute flex flex-col items-center gap-1"
                style={{ left: 260 + p.x - 30, top: 260 + p.y - 44, width: 60 }}
              >
                {/* card slot above avatar */}
                <div
                  className={`w-[34px] h-[46px] flex items-center justify-center font-mono font-bold text-[15px] border transition-all ${
                    revealed
                      ? "bg-white text-ink border-border"
                      : p.voted
                      ? "bg-ink border-ink text-ink" // face-down (filled)
                      : "bg-white border-dashed border-border text-transparent"
                  }`}
                >
                  {revealed ? (p.card ?? "–") : p.voted ? "" : ""}
                </div>
                <span
                  style={{ background: avatarColor(p.voterId) }}
                  className="w-[38px] h-[38px] rounded-full text-white text-[12px] font-mono font-semibold flex items-center justify-center border-2 border-paper"
                >{initials(p.voterName)}</span>
                <span className="text-[11px] font-medium text-center leading-tight max-w-[64px] overflow-hidden text-ellipsis whitespace-nowrap">{p.voterName}</span>
              </div>
            ))}

            {total === 0 && (
              <div className="absolute inset-0 flex items-end justify-center">
                <span className="text-[12.5px] text-muted3 pb-4">Share the code to bring people in.</span>
              </div>
            )}
          </div>
        </div>

        {/* Right stats panel (revealed only) */}
        {revealed && s.analysis && (
          <aside className="w-[260px] flex-none border-l border-border p-6 flex flex-col gap-5 overflow-y-auto">
            <div className="flex items-baseline gap-3">
              <span className="text-[40px] font-bold leading-none">{s.analysis.mode ?? "–"}</span>
              <span className="text-[15px] font-semibold text-muted">Most Votes</span>
            </div>
            <div className="flex flex-col gap-[10px] text-[13px]">
              <Row label="Voted" value={`${votedCount}/${total}`} />
              <Row label="Average" value={s.analysis.average != null ? s.analysis.average.toFixed(2) : "–"} />
              <Row label="Median" value={s.analysis.median != null ? String(s.analysis.median) : "–"} />
              <Row label="Confidence" value={s.analysis.confidence != null ? `${s.analysis.confidence}%` : "–"} />
            </div>

            <div className="flex flex-col gap-[6px] pt-1">
              {s.analysis.distribution.map((d) => (
                <div key={d.card} className="flex items-center gap-2">
                  <span className="font-mono text-[11px] text-muted2 w-[26px]">{d.count}x</span>
                  <span className="w-[28px] h-[30px] flex items-center justify-center border border-border bg-white font-mono text-[13px] font-bold">{d.card}</span>
                </div>
              ))}
            </div>

            <p className={`m-0 text-[12.5px] leading-[1.5] pt-1 ${s.analysis.safeToAccept ? "text-good" : "text-amberText"}`}>
              {s.analysis.verdict}
            </p>
          </aside>
        )}
      </div>

      {/* Bottom: fanned deck (voting) or organizer/observer controls */}
      <div className="border-t border-border px-[30px] py-4">
        {!revealed ? (
          <div className="flex items-end justify-between gap-4">
            <div className="flex items-end gap-[6px]">
              {DECK.map((card, i) => {
                const picked = s.myVote === card;
                return (
                  <button
                    key={card}
                    onClick={() => vote(card)}
                    disabled={busy}
                    className={`w-[46px] h-[64px] border font-mono text-[17px] font-bold transition-all ${
                      picked
                        ? "bg-accent text-white border-accent -translate-y-[10px] shadow-lg"
                        : "bg-white text-ink border-border hover:border-ink hover:-translate-y-[5px]"
                    }`}
                    style={{ transform: picked ? undefined : `rotate(${(i - (DECK.length - 1) / 2) * 2}deg)` }}
                  >{card}</button>
                );
              })}
            </div>
            <div className="flex items-center gap-3">
              {s.myVote && <span className="text-[12px] text-muted">Picked {s.myVote} · change anytime</span>}
              {s.isOrganizer && (
                <button onClick={reveal} disabled={busy || votedCount === 0} className="h-[40px] px-5 text-[13px] font-semibold bg-accent text-white disabled:opacity-40">
                  Reveal
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-3 flex-wrap">
            {s.finalPoints != null && (
              <span className="border border-good/40 bg-[#EAF6EF] px-3 py-2 text-[12.5px] text-good font-medium">
                ✓ {s.finalPoints} synced to {s.jiraKey}
              </span>
            )}
            {s.isOrganizer && (
              <>
                <button onClick={revote} disabled={busy} className="h-[40px] px-4 text-[13px] font-semibold bg-white border border-border text-muted hover:border-ink">
                  Re-vote (round {s.round + 1})
                </button>
                {s.analysis?.suggested != null && s.finalPoints == null && (
                  <button onClick={() => accept(s.analysis!.suggested!)} disabled={busy} className="h-[40px] px-5 text-[13px] font-semibold bg-ink text-white">
                    Accept {s.analysis.suggested} &amp; sync to Jira
                  </button>
                )}
              </>
            )}
            {!s.isOrganizer && <span className="text-[12px] text-muted3">Waiting for {s.organizerName} to accept or re-vote.</span>}
          </div>
        )}
      </div>

      {toast && <Toast message={toast} />}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between border-b border-borderFaint pb-[6px]">
      <span className="text-muted">{label}</span>
      <span className="font-mono font-semibold text-ink">{value}</span>
    </div>
  );
}
