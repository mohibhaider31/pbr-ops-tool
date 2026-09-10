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

  const [products, setProducts] = useState<
    { key: string; jiraName: string; exists: boolean; joined: boolean }[] | null
  >(null);

  // Only their own Jira token can see their project access, so this is
  // necessarily self-service — and whoever has the access is also the person
  // who can bring the product in, since no admin can see every Jira project.
  const findProducts = async () => {
    setBusy(true);
    setResult(null);
    try {
      const res = await fetch("/api/auth/my-products");
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { setResult(d.error || "Couldn't read your Jira projects"); return; }
      const list = d.products ?? [];
      setProducts(list);
      if (list.length === 0) setResult("No Jira projects are visible to your account.");
    } finally {
      setBusy(false);
    }
  };

  const join = async (key: string) => {
    setBusy(true);
    try {
      const res = await fetch("/api/auth/my-products/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectKey: key }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { setResult(d.error || "Couldn't add that product"); setBusy(false); return; }
      location.href = "/";
    } catch {
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
          <div className="flex flex-col gap-3 items-center w-full">
            {!products && (
              <button
                onClick={findProducts}
                disabled={busy}
                className="h-[38px] px-5 text-[13px] font-semibold bg-ink text-white disabled:opacity-50"
              >
                {busy ? "Checking Jira…" : "Verify my boards"}
              </button>
            )}

            {products && products.length > 0 && (
              <div className="w-full border border-border bg-white text-left">
                <div className="px-4 py-[9px] border-b border-borderLight font-mono text-[9px] tracking-[.1em] text-muted3">
                  YOUR JIRA PRODUCTS
                </div>
                <div className="max-h-[260px] overflow-y-auto">
                  {products.map((p) => (
                    <button
                      key={p.key}
                      onClick={() => join(p.key)}
                      disabled={busy}
                      className="w-full px-4 py-[10px] border-b border-borderFaint last:border-b-0 flex items-center gap-3 hover:bg-cream transition-colors disabled:opacity-50"
                    >
                      <span className="font-mono text-[11px] text-key w-[62px] flex-none text-left">{p.key}</span>
                      <span className="text-[12.5px] truncate text-left flex-1">{p.jiraName}</span>
                      <span className="font-mono text-[9.5px] text-muted3 flex-none">
                        {p.joined ? "open" : p.exists ? "join" : "add"}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}

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
