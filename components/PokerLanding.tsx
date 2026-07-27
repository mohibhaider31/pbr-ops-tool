"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useViewer } from "@/lib/useViewer";

export default function PokerLanding() {
  const router = useRouter();
  const { can, loading } = useViewer();
  const [joinCode, setJoinCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canVote = can("poker_vote");

  const create = async () => {
    setBusy(true);
    const res = await fetch("/api/poker/create", { method: "POST" });
    const data = await res.json();
    setBusy(false);
    if (data.code) router.push(`/poker/${data.code}`);
    else setError(data.error || "Could not start session");
  };

  const join = () => {
    const code = joinCode.trim().toUpperCase();
    if (code) router.push(`/poker/${code}`);
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <header className="px-[30px] pt-6 pb-4 border-b border-border">
        <h1 className="m-0 text-[25px] font-semibold tracking-[-0.025em]">Planning Poker</h1>
        <p className="m-0 mt-[5px] text-[12.5px] text-muted">
          Start a session, share the code, and estimate stories together — one queue, story by story.
        </p>
      </header>

      <div className="flex-1 overflow-y-auto px-[30px] py-8">
        <div className="max-w-[440px] flex flex-col gap-8">
          {/* Start a session */}
          {!loading && canVote && (
            <div className="border border-border bg-white p-6 flex flex-col gap-3">
              <span className="font-mono text-[10px] tracking-[.11em] text-muted2">NEW SESSION</span>
              <p className="m-0 text-[13px] text-muted leading-[1.55]">
                Create a room, then add Ready-For-Dev stories to its queue and walk the team through them.
              </p>
              <button
                onClick={create}
                disabled={busy}
                className="h-[42px] px-5 text-[14px] font-semibold bg-accent text-white disabled:opacity-50 self-start"
              >
                {busy ? "Creating…" : "Start a session"}
              </button>
              {error && <span className="text-[12.5px] text-accent">{error}</span>}
            </div>
          )}

          {/* Join a session */}
          <div className="border border-border bg-white p-6 flex flex-col gap-3">
            <span className="font-mono text-[10px] tracking-[.11em] text-muted2">JOIN A SESSION</span>
            <p className="m-0 text-[13px] text-muted leading-[1.55]">
              Got an invite code from your PO? Enter it to join the room.
            </p>
            <div className="flex gap-2">
              <input
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                placeholder="e.g. K4P2QX"
                className="h-[42px] px-3 text-[15px] font-mono tracking-[.1em] border border-border bg-cream outline-none flex-1"
                onKeyDown={(e) => e.key === "Enter" && join()}
              />
              <button onClick={join} className="h-[42px] px-5 text-[14px] font-semibold bg-ink text-white">Join</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
