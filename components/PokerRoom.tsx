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
  error?: string;
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

  // Live updates: any event just re-fetches state (simple + correct).
  usePokerChannel(code, {
    "vote-update": () => load(),
    "revealed": () => load(),
    "re-vote": () => load(),
    "accepted": () => load(),
  });

  const showToast = (m: string) => { setToast(m); setTimeout(() => setToast(null), 2600); };

  const vote = async (card: string) => {
    setBusy(true);
    // optimistic
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
          <button onClick={() => router.push("/poker")} className="mt-4 h-[36px] px-4 text-[13px] font-semibold bg-ink text-white">
            Back to Poker
          </button>
        </div>
      </div>
    );
  }
  if (!s) return <div className="p-8 text-sm text-muted2 font-mono">Loading session…</div>;

  const revealed = s.state === "REVEALED";
  const votedCount = s.participants.filter((p) => p.voted).length;

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <header className="px-[30px] pt-5 pb-4 border-b border-border flex items-start justify-between gap-6">
        <div className="flex flex-col gap-[6px] min-w-0">
          <div className="flex items-center gap-[10px]">
            <span className="font-mono text-[12px] font-bold text-key">{s.jiraKey}</span>
            <span className="font-mono text-[9.5px] tracking-[.08em] border border-border px-[7px] py-[3px] text-muted2">
              ROUND {s.round}
            </span>
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
            className="font-mono text-[20px] font-bold tracking-[.14em] text-ink hover:text-accent transition-colors"
            title="Click to copy"
          >
            {s.code}
          </button>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto px-[30px] py-6 flex flex-col gap-7 max-w-[860px]">
        {/* Participants */}
        <section>
          <div className="flex items-center justify-between mb-2">
            <span className="font-mono text-[10px] tracking-[.11em] text-muted2">
              PARTICIPANTS · {votedCount}/{s.participants.length || 0} voted
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            {s.participants.length === 0 && (
              <span className="text-[12.5px] text-muted3">No votes yet — share the code to bring people in.</span>
            )}
            {s.participants.map((p) => (
              <div key={p.voterId} className="flex items-center gap-2 border border-border bg-white px-[10px] h-[38px]">
                <span style={{ background: avatarColor(p.voterId) }} className="w-[22px] h-[22px] rounded-full text-white text-[9px] font-mono font-semibold flex items-center justify-center">
                  {initials(p.voterName)}
                </span>
                <span className="text-[12.5px]">{p.voterName}</span>
                {revealed
                  ? <span className="font-mono text-[13px] font-bold text-ink ml-1">{p.card}</span>
                  : <span className={`font-mono text-[11px] ml-1 ${p.voted ? "text-good" : "text-muted3"}`}>{p.voted ? "✓" : "…"}</span>}
              </div>
            ))}
          </div>
        </section>

        {/* Card deck (voting) */}
        {!revealed && (
          <section>
            <span className="font-mono text-[10px] tracking-[.11em] text-muted2">YOUR CARD</span>
            <div className="mt-2 flex flex-wrap gap-2">
              {DECK.map((card) => {
                const picked = s.myVote === card;
                return (
                  <button
                    key={card}
                    onClick={() => vote(card)}
                    disabled={busy}
                    className={`w-[54px] h-[74px] border font-mono text-[20px] font-bold transition-all ${
                      picked ? "bg-accent text-white border-accent -translate-y-[6px] shadow-lg" : "bg-white text-ink border-border hover:border-ink hover:-translate-y-[3px]"
                    }`}
                  >
                    {card}
                  </button>
                );
              })}
            </div>
            {s.myVote && <p className="mt-2 text-[12px] text-muted">You picked {s.myVote}. You can change it until reveal.</p>}
          </section>
        )}

        {/* Reveal analysis */}
        {revealed && s.analysis && (
          <section className="border border-borderLight bg-white p-5">
            <div className="flex items-start gap-8">
              <div className="flex flex-col gap-1">
                <span className="font-mono text-[10px] tracking-[.11em] text-muted3">SPREAD</span>
                <span className="text-[22px] font-semibold">{s.analysis.spreadLabel}</span>
              </div>
              <div className="flex flex-col gap-1">
                <span className="font-mono text-[10px] tracking-[.11em] text-muted3">MEDIAN</span>
                <span className="text-[22px] font-semibold">{s.analysis.median ?? "–"}</span>
              </div>
              <div className="flex flex-col gap-1">
                <span className="font-mono text-[10px] tracking-[.11em] text-muted3">SUGGESTED</span>
                <span className="text-[22px] font-semibold text-accent">{s.analysis.suggested ?? "–"}</span>
              </div>
            </div>
            <p className={`m-0 mt-4 text-[13px] leading-[1.5] ${s.analysis.safeToAccept ? "text-good" : "text-amberText"}`}>
              {s.analysis.verdict}
            </p>
          </section>
        )}

        {/* Final synced banner */}
        {s.finalPoints != null && (
          <div className="border border-good/40 bg-[#EAF6EF] px-4 py-3 text-[13px] text-good font-medium">
            ✓ {s.finalPoints} points accepted and synced to {s.jiraKey} in Jira.
          </div>
        )}

        {/* Organizer controls */}
        {s.isOrganizer && (
          <section className="border-t border-borderLight pt-5 flex items-center gap-3 flex-wrap">
            {!revealed && (
              <button
                onClick={reveal}
                disabled={busy || votedCount === 0}
                className="h-[38px] px-5 text-[13px] font-semibold bg-accent text-white disabled:opacity-40"
              >
                Reveal cards
              </button>
            )}
            {revealed && (
              <>
                <button onClick={revote} disabled={busy} className="h-[38px] px-4 text-[13px] font-semibold bg-white border border-border text-muted hover:border-ink">
                  Re-vote (round {s.round + 1})
                </button>
                {s.analysis?.suggested != null && s.finalPoints == null && (
                  <button onClick={() => accept(s.analysis!.suggested!)} disabled={busy} className="h-[38px] px-5 text-[13px] font-semibold bg-ink text-white">
                    Accept {s.analysis.suggested} &amp; sync to Jira
                  </button>
                )}
              </>
            )}
            {!revealed && votedCount === 0 && (
              <span className="text-[12px] text-muted3">Waiting for at least one vote to reveal.</span>
            )}
          </section>
        )}
        {!s.isOrganizer && !revealed && (
          <p className="text-[12px] text-muted3 border-t border-borderLight pt-5">
            Waiting for {s.organizerName} to reveal. Your card stays hidden until then.
          </p>
        )}
      </div>

      {toast && <Toast message={toast} />}
    </div>
  );
}
