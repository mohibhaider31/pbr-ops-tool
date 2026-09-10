"use client";

import { useState } from "react";

// Shown when a signed-in user belongs to no board.
//
// Board membership IS the access control, so having none is a legitimate state
// — not an error. Previously it produced 36 different "no board" API failures
// and an app that looked broken.
export default function NoProductAssigned({
  name,
  canRescan,
}: {
  name?: string | null;
  canRescan?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  // Only their own Jira token can see their project access, so this has to be
  // self-service — an admin can't run it for them.
  const rescan = async () => {
    setBusy(true);
    setResult(null);
    try {
      const res = await fetch("/api/auth/rescan-boards", { method: "POST" });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { setResult(d.error || "Couldn't check"); return; }
      if ((d.granted ?? []).length > 0) { location.reload(); return; }
      setResult(
        (d.noMatch ?? []).length > 0
          ? `You can see ${d.noMatch.length} Jira project${d.noMatch.length === 1 ? "" : "s"}, but none of them have a board here yet.`
          : "No matching products found for your Jira access."
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex-1 flex items-center justify-center p-8">
      <div className="max-w-[460px] flex flex-col gap-4 text-center">
        <div className="flex items-center justify-center gap-[10px]">
          <span className="bg-accent text-white font-mono font-bold text-[12px] tracking-[.06em] px-[8px] py-[4px]">
            PBR
          </span>
          <span className="text-[15px] font-semibold tracking-[.02em]">Ops Tool</span>
        </div>

        <div className="border border-border bg-white px-7 py-8 flex flex-col gap-3">
          <span className="text-[17px] font-semibold">
            {name ? `You're signed in, ${name.split(" ")[0]}` : "You're signed in"}
          </span>
          <p className="m-0 text-[13px] text-muted leading-[1.6]">
            You don&apos;t have a product assigned yet, so there&apos;s nothing to show. An
            administrator needs to give you access to a board before you can see its backlog,
            pipeline or roadmap.
          </p>
          <p className="m-0 text-[12px] text-muted3 leading-[1.55]">
            Ask whoever set up your account to add you in <strong>Settings → Boards</strong>. Once
            they do, refresh and your product will appear here.
          </p>
        </div>

        {canRescan && (
          <div className="flex flex-col gap-2 items-center">
            <button
              onClick={rescan}
              disabled={busy}
              className="h-[36px] px-4 text-[13px] font-semibold bg-ink text-white disabled:opacity-50"
            >
              {busy ? "Checking Jira…" : "Check my Jira access"}
            </button>
            {result && <span className="text-[12px] text-muted2 max-w-[380px]">{result}</span>}
          </div>
        )}

        <a href="/api/auth/logout" className="text-[12.5px] text-muted2 hover:text-key">
          Sign out
        </a>
      </div>
    </div>
  );
}
