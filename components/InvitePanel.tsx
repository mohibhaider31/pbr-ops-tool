"use client";

import { useCallback, useEffect, useState } from "react";

// Admin panel for provisioning stakeholder (local) accounts.
//
// There is no mail provider wired up, so the invite link is shown once here for
// the admin to pass on. The raw token is never stored server-side — only its
// hash — so it cannot be recovered later; if it's lost, re-invite.

type Invite = { id: string; email: string; name: string; expiresAt: string; createdAt: string };

export default function InvitePanel({ boardName }: { boardName?: string }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [grantBoard, setGrantBoard] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [issued, setIssued] = useState<{ url: string | null; days: number; emailed: boolean } | null>(null);
  const [copied, setCopied] = useState(false);
  const [pending, setPending] = useState<Invite[] | null>(null);

  const loadPending = useCallback(() => {
    fetch("/api/people/invite")
      .then((r) => r.json())
      .then((d) => Array.isArray(d?.invites) && setPending(d.invites))
      .catch(() => {});
  }, []);

  useEffect(() => { if (open) loadPending(); }, [open, loadPending]);

  const submit = async () => {
    if (!name.trim() || !email.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/people/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, grantBoardAccess: grantBoard }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || "Could not create invite");
      setIssued({ url: d.inviteUrl ?? null, days: d.expiresInDays, emailed: !!d.emailed });
      setName("");
      setEmail("");
      loadPending();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const copy = () => {
    if (!issued?.url) return;
    navigator.clipboard?.writeText(issued.url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="h-[34px] px-4 text-[13px] font-semibold border border-border hover:border-ink transition-colors"
      >
        + Invite stakeholder
      </button>
    );
  }

  return (
    <div className="w-full border border-border bg-white p-5 flex flex-col gap-4">
      <div className="flex items-start gap-3">
        <div className="flex flex-col gap-1 flex-1">
          <span className="text-[14px] font-semibold">Invite a stakeholder</span>
          <p className="m-0 text-[12px] text-muted leading-[1.55]">
            Creates a read-only account for someone without an Atlassian licence — they sign in with
            an email and password and can view the roadmap. They can&apos;t change anything in Jira.
          </p>
        </div>
        <button onClick={() => { setOpen(false); setIssued(null); }} className="text-muted3 hover:text-ink text-[16px] leading-none">
          ×
        </button>
      </div>

      {issued ? (
        <div className="flex flex-col gap-3">
          <div className="border border-good/40 bg-good/5 px-4 py-3 flex flex-col gap-2">
            <span className="text-[12.5px] font-semibold text-good">
              {issued.emailed ? "Invite emailed" : "Invite created"}
            </span>
            {issued.emailed ? (
              <p className="m-0 text-[12px] text-muted leading-[1.5]">
                We&apos;ve emailed them a link to set a password. It works once and expires in{" "}
                {issued.days} days.
              </p>
            ) : (
              <>
                <p className="m-0 text-[12px] text-muted leading-[1.5]">
                  No email provider is configured, so send this link to them yourself. It works once
                  and expires in {issued.days} days — and it isn&apos;t stored anywhere, so copy it
                  now. If you lose it, just invite them again.
                </p>
                <div className="flex items-center gap-2">
                  <input
                    readOnly
                    value={issued.url ?? ""}
                    onFocus={(e) => e.currentTarget.select()}
                    className="flex-1 h-[34px] px-2 border border-border bg-cream font-mono text-[11px]"
                  />
                  <button onClick={copy} className="h-[34px] px-3 text-[12px] font-semibold bg-ink text-white">
                    {copied ? "Copied" : "Copy"}
                  </button>
                </div>
              </>
            )}
          </div>
          <button onClick={() => setIssued(null)} className="self-start text-[12.5px] text-key hover:text-accent">
            Invite someone else
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <div className="flex gap-2">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Full name"
              className="flex-1 h-[36px] px-3 border border-border bg-white outline-none text-[13px] focus:border-ink"
            />
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submit()}
              placeholder="email@company.com"
              className="flex-1 h-[36px] px-3 border border-border bg-white outline-none text-[13px] focus:border-ink"
            />
          </div>

          <label className="flex items-center gap-2 text-[12.5px] text-muted cursor-pointer">
            <input type="checkbox" checked={grantBoard} onChange={(e) => setGrantBoard(e.target.checked)} />
            Give them view access to {boardName || "this board"}
          </label>

          {error && <span className="text-[12.5px] text-accent">{error}</span>}

          <button
            onClick={submit}
            disabled={busy || !name.trim() || !email.trim()}
            className="self-start h-[36px] px-4 text-[13px] font-semibold bg-accent text-white disabled:opacity-40"
          >
            {busy ? "Creating…" : "Create invite link"}
          </button>
        </div>
      )}

      {pending && pending.length > 0 && (
        <div className="flex flex-col gap-2 pt-3 border-t border-borderLight">
          <span className="font-mono text-[9.5px] tracking-[.1em] text-muted3">
            AWAITING ACCEPTANCE ({pending.length})
          </span>
          {pending.map((i) => (
            <div key={i.id} className="flex items-center gap-3 text-[12.5px]">
              <span className="font-medium">{i.name}</span>
              <span className="text-muted2">{i.email}</span>
              <span className="ml-auto font-mono text-[10.5px] text-muted3">
                expires {new Date(i.expiresAt).toLocaleDateString()}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
