"use client";

import { useCallback, useEffect, useState } from "react";
import { useViewer } from "@/lib/useViewer";
import TwoFactorPanel from "./TwoFactorPanel";

// Surfaces the session and audit endpoints, which previously worked but had no
// UI — so a leaked cookie couldn't be revoked from the app, and nobody could
// see how an account got access.

type SessionRow = {
  id: string;
  createdAt: string;
  expiresAt: string | null;
  authType: string;
  isCurrent: boolean;
};
type AuthEvent = {
  id: string;
  kind: string;
  actorName: string | null;
  subject: string | null;
  authType: string | null;
  ip: string | null;
  detail: string | null;
  createdAt: string;
};

const KIND_LABEL: Record<string, string> = {
  LOGIN: "Signed in",
  LOGIN_FAILED: "Failed sign-in",
  LOGOUT: "Signed out",
  INVITE_CREATED: "Invite created",
  INVITE_ACCEPTED: "Invite accepted",
  PASSWORD_RESET_ISSUED: "Reset link issued",
  PASSWORD_RESET_USED: "Password reset",
  ATLASSIAN_LINKED: "Atlassian linked",
  SESSIONS_REVOKED: "Sessions revoked",
  ACCOUNT_DEACTIVATED: "Account deactivated",
  ACCOUNT_REACTIVATED: "Account reactivated",
};

function when(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

export default function SecurityPanel() {
  const { viewer } = useViewer();
  const isAdmin = !!viewer?.isAdmin;

  const [sessions, setSessions] = useState<SessionRow[] | null>(null);
  const [events, setEvents] = useState<AuthEvent[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const loadSessions = useCallback(() => {
    fetch("/api/auth/sessions")
      .then((r) => r.json())
      .then((d) => Array.isArray(d?.sessions) && setSessions(d.sessions))
      .catch(() => {});
  }, []);

  const loadEvents = useCallback(() => {
    if (!isAdmin) return;
    fetch("/api/admin/auth-events")
      .then((r) => r.json())
      .then((d) => Array.isArray(d?.events) && setEvents(d.events))
      .catch(() => {});
  }, [isAdmin]);

  useEffect(() => { loadSessions(); loadEvents(); }, [loadSessions, loadEvents]);

  const revokeOthers = async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/auth/sessions", { method: "DELETE" });
      const d = await res.json().catch(() => ({}));
      setNote(res.ok ? `Signed out of ${d.revoked ?? 0} other session${d.revoked === 1 ? "" : "s"}.` : d.error || "Couldn't revoke");
      loadSessions();
      loadEvents();
    } finally {
      setBusy(false);
    }
  };

  const otherCount = (sessions ?? []).filter((s) => !s.isCurrent).length;

  return (
    <div className="flex flex-col gap-7">
      <TwoFactorPanel />

      {/* Sessions */}
      <section className="flex flex-col gap-3">
        <div className="flex items-end justify-between gap-4">
          <div className="flex flex-col gap-1">
            <span className="text-[14px] font-semibold">Your sessions</span>
            <p className="m-0 text-[12px] text-muted leading-[1.5]">
              Each browser you sign in from creates a session lasting up to 30 days. If you&apos;ve
              signed in somewhere you no longer trust, end the others.
            </p>
          </div>
          {otherCount > 0 && (
            <button
              onClick={revokeOthers}
              disabled={busy}
              className="flex-none h-[32px] px-3 text-[12.5px] font-semibold border border-border hover:border-accent hover:text-accent transition-colors disabled:opacity-50"
            >
              {busy ? "Ending…" : `Sign out ${otherCount} other${otherCount === 1 ? "" : "s"}`}
            </button>
          )}
        </div>

        {note && <span className="text-[12.5px] text-good">{note}</span>}

        <div className="border border-borderLight">
          {!sessions ? (
            <div className="px-4 py-3 text-[12.5px] text-muted2 font-mono">Loading…</div>
          ) : sessions.length === 0 ? (
            <div className="px-4 py-3 text-[12.5px] text-muted3">No sessions found.</div>
          ) : (
            sessions.map((s) => (
              <div key={s.id} className="px-4 py-[10px] border-b border-borderFaint last:border-b-0 flex items-center gap-3 text-[12.5px]">
                <span className={`w-[6px] h-[6px] rounded-full flex-none ${s.isCurrent ? "bg-good" : "bg-border"}`} />
                <span className="font-medium">{s.isCurrent ? "This browser" : "Another browser"}</span>
                <span className="font-mono text-[10px] tracking-[.06em] text-muted3 border border-border px-[6px] py-[1px]">
                  {s.authType === "local" ? "PASSWORD" : "ATLASSIAN"}
                </span>
                <span className="ml-auto font-mono text-[10.5px] text-muted3">
                  started {when(s.createdAt)}
                  {s.expiresAt ? ` · expires ${new Date(s.expiresAt).toLocaleDateString()}` : ""}
                </span>
              </div>
            ))
          )}
        </div>
      </section>

      {/* Audit log */}
      {isAdmin && (
        <section className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <span className="text-[14px] font-semibold">Recent access activity</span>
            <p className="m-0 text-[12px] text-muted leading-[1.5]">
              Who signed in, who was invited, and what failed — so you can answer how an account got
              access. Last 100 events.
            </p>
          </div>

          <div className="border border-borderLight max-h-[420px] overflow-y-auto">
            {!events ? (
              <div className="px-4 py-3 text-[12.5px] text-muted2 font-mono">Loading…</div>
            ) : events.length === 0 ? (
              <div className="px-4 py-3 text-[12.5px] text-muted3">Nothing recorded yet.</div>
            ) : (
              events.map((e) => {
                const failed = e.kind === "LOGIN_FAILED";
                return (
                  <div key={e.id} className="px-4 py-[9px] border-b border-borderFaint last:border-b-0 flex items-center gap-3 text-[12.5px]">
                    <span className={`font-medium flex-none ${failed ? "text-accent" : "text-ink"}`} style={{ width: 132 }}>
                      {KIND_LABEL[e.kind] ?? e.kind}
                    </span>
                    <span className="text-muted2 min-w-0 truncate">
                      {e.subject ?? "—"}
                      {e.actorName && e.actorName !== e.subject && (
                        <span className="text-muted3"> · by {e.actorName}</span>
                      )}
                    </span>
                    {e.detail && (
                      <span className="font-mono text-[10px] text-muted3 flex-none">{e.detail}</span>
                    )}
                    <span className="ml-auto font-mono text-[10.5px] text-muted3 flex-none">
                      {when(e.createdAt)}
                    </span>
                  </div>
                );
              })
            )}
          </div>
        </section>
      )}
    </div>
  );
}
