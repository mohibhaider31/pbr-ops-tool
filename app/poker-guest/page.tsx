"use client";

import { useState } from "react";
import GuestPokerRoom from "@/components/GuestPokerRoom";

// Public guest entry: enter session code + name, then vote. No Atlassian login.
export default function PokerGuestPage() {
  const [joined, setJoined] = useState<{ code: string; name: string } | null>(null);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const join = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/poker/guest/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, name }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Could not join");
      setJoined({ code: d.code, name: d.name });
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  if (joined) return <GuestPokerRoom code={joined.code} name={joined.name} />;

  return (
    <div className="min-h-screen w-full bg-paper text-ink font-sans flex items-center justify-center p-6">
      <div className="w-full max-w-[380px] flex flex-col gap-5">
        <div className="flex items-center gap-[10px]">
          <span className="bg-accent text-white font-mono font-bold text-[13px] tracking-[.06em] px-[9px] py-[5px]">PBR</span>
          <span className="text-[16px] font-semibold tracking-[.02em]">Planning Poker</span>
        </div>
        <div className="flex flex-col gap-1">
          <h1 className="m-0 text-[22px] font-semibold tracking-[-0.02em]">Join as guest</h1>
          <p className="m-0 text-[12.5px] text-muted">Enter the session code your organizer shared, and your name. Guests can vote only.</p>
        </div>
        <div className="flex flex-col gap-3">
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="Session code"
            className="h-[42px] px-3 border border-border bg-white outline-none font-mono text-[16px] tracking-[.12em] uppercase"
          />
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Your name"
            onKeyDown={(e) => e.key === "Enter" && code && name && join()}
            className="h-[42px] px-3 border border-border bg-white outline-none text-[14px]"
          />
          {error && <div className="text-[12.5px] text-accent">{error}</div>}
          <button
            onClick={join}
            disabled={busy || !code.trim() || !name.trim()}
            className="h-[42px] bg-ink text-white text-[13px] font-semibold disabled:opacity-40"
          >
            {busy ? "Joining…" : "Join session"}
          </button>
        </div>
        <p className="m-0 text-[11px] text-muted3">
          Are you on the team? <a href="/login" className="text-key">Sign in with Atlassian</a> for full access.
        </p>
      </div>
    </div>
  );
}
