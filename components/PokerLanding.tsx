"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useViewer } from "@/lib/useViewer";

type Story = { key: string; summary: string; status: string; storyPoints: number | null };

export default function PokerLanding() {
  const router = useRouter();
  const { can, loading } = useViewer();
  const [stories, setStories] = useState<Story[] | null>(null);
  const [query, setQuery] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canVote = can("poker_vote");

  useEffect(() => {
    if (loading || !canVote) return;
    fetch("/api/poker/ready-stories")
      .then((r) => r.json())
      .then((d) => (d.error ? setError(d.error) : setStories(d.stories)))
      .catch((e) => setError(e.message));
  }, [loading, canVote]);

  const filtered = useMemo(() => {
    if (!stories) return [];
    if (!query.trim()) return stories;
    const q = query.toLowerCase();
    return stories.filter((s) => s.key.toLowerCase().includes(q) || s.summary.toLowerCase().includes(q));
  }, [stories, query]);

  const start = async (story: Story) => {
    setBusy(true);
    const res = await fetch("/api/poker/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jiraKey: story.key, summary: story.summary }),
    });
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
          Estimate together — everyone votes privately, reveal at once, no anchoring.
        </p>
      </header>

      <div className="flex-1 overflow-y-auto px-[30px] py-6">
        {/* Join by code */}
        <div className="mb-8 max-w-[560px]">
          <span className="font-mono text-[10px] tracking-[.11em] text-muted2">JOIN A SESSION</span>
          <div className="mt-2 flex gap-2">
            <input
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
              placeholder="Enter invite code (e.g. K4P2QX)"
              className="h-[40px] px-3 text-[14px] font-mono tracking-[.08em] border border-border bg-white outline-none flex-1"
              onKeyDown={(e) => e.key === "Enter" && join()}
            />
            <button onClick={join} className="h-[40px] px-5 text-[13px] font-semibold bg-ink text-white">
              Join
            </button>
          </div>
        </div>

        {/* Start new (only for those who can vote/organize) */}
        {!loading && !canVote ? (
          <div className="border border-dashed border-border bg-cream px-6 py-8 max-w-[560px] text-center text-[13px] text-muted">
            You can join sessions by code, but starting a session requires a voting role.
          </div>
        ) : (
          <div className="max-w-[720px]">
            <div className="flex items-center justify-between mb-2">
              <span className="font-mono text-[10px] tracking-[.11em] text-muted2">
                START A SESSION · READY FOR DEV
              </span>
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search stories"
                className="h-[30px] px-3 text-[12.5px] border border-border bg-white outline-none w-[200px]"
              />
            </div>

            {error && <div className="border border-amberBorder bg-amberBg px-3 py-2 text-[12.5px] text-amberTextDark mb-3">{error}</div>}
            {!stories && !error && <div className="text-[13px] text-muted2 font-mono py-4">Loading stories…</div>}
            {stories && filtered.length === 0 && (
              <div className="border border-dashed border-border bg-cream px-6 py-8 text-center text-[13px] text-muted">
                {query ? "No matches." : "No stories in Ready For Dev yet. Move a story through PBR first."}
              </div>
            )}

            <div className="border border-borderLight bg-white">
              {filtered.map((s) => (
                <div
                  key={s.key}
                  className="flex items-center gap-3 px-4 h-[48px] border-b border-borderFaint last:border-b-0 hover:bg-cream transition-colors"
                >
                  <span className="font-mono text-[12px] font-medium text-key w-[64px]">{s.key}</span>
                  <span className="text-[13.5px] flex-1 overflow-hidden text-ellipsis whitespace-nowrap">{s.summary}</span>
                  {s.storyPoints != null && (
                    <span className="font-mono text-[10px] text-muted3">{s.storyPoints} pts</span>
                  )}
                  <button
                    onClick={() => start(s)}
                    disabled={busy}
                    className="h-[30px] px-3 text-[12px] font-semibold bg-accent text-white disabled:opacity-50"
                  >
                    Start
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
