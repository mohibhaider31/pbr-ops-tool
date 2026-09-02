"use client";

import { useEffect, useState, useCallback } from "react";
import { avatarColor, initials } from "@/lib/avatar";
import { ROLE_LABEL, type BoardRole } from "@/lib/permissions";
import { useViewer } from "@/lib/useViewer";
import Toast from "./Toast";
import InvitePanel from "./InvitePanel";

type Person = {
  id: string;
  accountId: string | null;
  name: string;
  email: string | null;
  avatarUrl: string | null;
  role: BoardRole | null; // role on the current board; null if not a member here
  isMember: boolean;
  isAdmin: boolean;
  source: string;
  active: boolean;
  firstLoginAt: string | null;
};

const ROLES: BoardRole[] = ["PO", "BA", "DEVELOPER", "VIEWER"];

export default function PeopleSettings() {
  const { viewer, loading: viewerLoading } = useViewer();
  const [people, setPeople] = useState<Person[] | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [addEmail, setAddEmail] = useState("");
  const [addName, setAddName] = useState("");
  const [addOpen, setAddOpen] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch("/api/people");
    const data = await res.json();
    if (!data.error) setPeople(data.people);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const showToast = (m: string) => {
    setToast(m);
    setTimeout(() => setToast(null), 2600);
  };

  const isAdmin = viewer?.isAdmin;

  const sync = async () => {
    setSyncing(true);
    const res = await fetch("/api/people/sync", { method: "POST" });
    const data = await res.json();
    setSyncing(false);
    if (data.error) showToast(`Sync failed: ${data.error}`);
    else showToast(`Synced ${data.total} members (${data.added} new)`);
    load();
  };

  const setRole = async (p: Person, role: BoardRole) => {
    const prevRole = p.role, prevMember = p.isMember;
    setPeople((prev) => prev?.map((x) => (x.id === p.id ? { ...x, role, isMember: true } : x)) || prev);
    const res = await fetch(`/api/people/${p.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role }),
    });
    if (!res.ok) {
      setPeople((prev) => prev?.map((x) => (x.id === p.id ? { ...x, role: prevRole, isMember: prevMember } : x)) || prev);
      showToast("Couldn't change role");
    }
  };

  const removeFromBoard = async (p: Person) => {
    if (!window.confirm(`Remove ${p.name} from this board? They keep their access to other boards.`)) return;
    const snapshot = people;
    setPeople((prev) => prev?.map((x) => (x.id === p.id ? { ...x, isMember: false, role: null } : x)) || prev);
    const res = await fetch(`/api/people/${p.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ removeFromBoard: true }),
    });
    if (!res.ok) { setPeople(snapshot); showToast("Couldn't remove from board"); }
  };

  const toggleAdmin = async (p: Person) => {
    const next = !p.isAdmin;
    setPeople((prev) => prev?.map((x) => (x.id === p.id ? { ...x, isAdmin: next } : x)) || prev);
    const res = await fetch(`/api/people/${p.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isAdmin: next }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.error) {
      setPeople((prev) => prev?.map((x) => (x.id === p.id ? { ...x, isAdmin: !next } : x)) || prev);
      showToast(data.error || "Couldn't change admin");
    }
  };

  const removePerson = async (p: Person) => {
    if (!window.confirm(`Remove ${p.name}?`)) return;
    const snapshot = people;
    setPeople((prev) => prev?.filter((x) => x.id !== p.id) || prev);
    const res = await fetch(`/api/people/${p.id}`, { method: "DELETE" });
    if (!res.ok) { setPeople(snapshot); showToast("Couldn't remove"); }
  };

  const addManual = async () => {
    if (!addEmail.trim()) return;
    const res = await fetch("/api/people", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: addEmail, name: addName }),
    });
    const data = await res.json();
    if (data.error) showToast(data.error);
    else showToast("Person added");
    setAddEmail("");
    setAddName("");
    setAddOpen(false);
    load();
  };

  if (viewerLoading) return <div className="p-8 text-sm text-muted2 font-mono">Loading…</div>;

  // Non-admins get a read-only notice (this screen is admin-only per spec).
  if (!isAdmin) {
    return (
      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="px-[30px] pt-6 pb-4 border-b border-border">
          <h1 className="m-0 text-[25px] font-semibold tracking-[-0.025em]">Settings</h1>
        </header>
        <div className="flex-1 flex items-center justify-center p-8">
          <div className="border border-dashed border-border bg-cream px-8 py-10 text-center max-w-[420px]">
            <span className="text-[15px] font-semibold">Admin only</span>
            <p className="m-0 mt-2 text-[13px] text-muted leading-[1.55]">
              People and role management is available to admins. Ask an admin if you need a role changed.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <header className="flex items-end justify-between gap-6 px-[30px] pt-6 pb-4 border-b border-border">
        <div className="flex flex-col gap-[5px]">
          <h1 className="m-0 text-[25px] font-semibold tracking-[-0.025em]">People &amp; Roles</h1>
          <p className="m-0 text-[12.5px] text-muted">
            Assign roles for this board. Sync pulls members from the board’s Jira project; new people start as Developer. Roles are per-board — someone can be PO here and a Developer elsewhere.
          </p>
          {people && (
            <div className="flex items-center gap-4 mt-1">
              <span className="font-mono text-[11px] text-muted2">
                <span className="text-good font-semibold">{people.filter((p) => p.active).length}</span> active
              </span>
              <span className="font-mono text-[11px] text-muted2">
                <span className="text-amberText font-semibold">{people.filter((p) => !p.active).length}</span> invited, not yet signed in
              </span>
            </div>
          )}
        </div>
        <div className="flex items-center gap-[10px]">
          <button
            onClick={() => setAddOpen((v) => !v)}
            className="h-[38px] px-4 text-[13px] font-semibold bg-white text-muted border border-border hover:border-ink transition-colors"
          >
            + Add by email
          </button>
          <button
            onClick={sync}
            disabled={syncing}
            className="h-[38px] px-4 text-[13px] font-semibold bg-ink text-white disabled:opacity-50 hover:bg-[#2E2B25] transition-colors"
          >
            {syncing ? "Syncing…" : "Sync from Jira"}
          </button>
        </div>
      </header>

      {addOpen && (
        <div className="px-[30px] py-3 border-b border-borderLight bg-cream flex items-center gap-2">
          <input
            value={addName}
            onChange={(e) => setAddName(e.target.value)}
            placeholder="Name (optional)"
            className="h-[34px] px-3 text-[13px] border border-border bg-white outline-none w-[180px]"
          />
          <input
            value={addEmail}
            onChange={(e) => setAddEmail(e.target.value)}
            placeholder="email@company.com"
            className="h-[34px] px-3 text-[13px] border border-border bg-white outline-none flex-1 max-w-[280px]"
            onKeyDown={(e) => e.key === "Enter" && addManual()}
          />
          <button onClick={addManual} className="h-[34px] px-4 text-[13px] font-semibold bg-accent text-white">
            Add
          </button>
        </div>
      )}

      <div className="px-[30px] py-3 border-b border-borderLight">
        <InvitePanel />
      </div>

      <div className="flex-1 overflow-y-auto">
        {!people ? (
          <div className="p-8 text-sm text-muted2 font-mono">Loading people…</div>
        ) : people.length === 0 ? (
          <div className="flex-1 flex items-center justify-center p-8">
            <div className="border border-dashed border-border bg-cream px-8 py-10 text-center max-w-[420px]">
              <span className="text-[15px] font-semibold">No people yet</span>
              <p className="m-0 mt-2 text-[13px] text-muted leading-[1.55]">
                Click <strong>Sync from Jira</strong> to pull your board members, or add someone by email.
              </p>
            </div>
          </div>
        ) : (
          <>
            <div
              className="grid gap-0 px-[30px] items-center h-[34px] border-b border-borderLight sticky top-0 bg-paper z-[2]"
              style={{ gridTemplateColumns: "minmax(200px,1fr) 130px 110px 80px 80px 40px" }}
            >
              <span className="font-mono text-[9.5px] tracking-[.11em] text-muted3">PERSON</span>
              <span className="font-mono text-[9.5px] tracking-[.11em] text-muted3">ROLE</span>
              <span className="font-mono text-[9.5px] tracking-[.11em] text-muted3">STATUS</span>
              <span className="font-mono text-[9.5px] tracking-[.11em] text-muted3 text-center">ADMIN</span>
              <span className="font-mono text-[9.5px] tracking-[.11em] text-muted3 text-center">SOURCE</span>
              <span></span>
            </div>
            {people.map((p) => (
              <div
                key={p.id}
                className="group grid gap-0 px-[30px] items-center h-[54px] border-b border-borderLight hover:bg-cream transition-colors"
                style={{ gridTemplateColumns: "minmax(200px,1fr) 130px 110px 80px 80px 40px" }}
              >
                <div className="flex items-center gap-[10px] min-w-0">
                  <span
                    style={{ background: avatarColor(p.email || p.name) }}
                    className="w-[26px] h-[26px] rounded-full text-white text-[10px] font-mono font-semibold flex items-center justify-center flex-none"
                  >
                    {initials(p.name)}
                  </span>
                  <div className="flex flex-col min-w-0">
                    <span className="text-[13.5px] font-medium overflow-hidden text-ellipsis whitespace-nowrap">
                      {p.name}
                    </span>
                    <span className="text-[11px] text-muted3 overflow-hidden text-ellipsis whitespace-nowrap">
                      {p.email || "no email"}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <select
                    value={p.role ?? ""}
                    onChange={(e) => setRole(p, e.target.value as BoardRole)}
                    className={`h-[30px] px-2 text-[12.5px] border border-border bg-white outline-none cursor-pointer ${!p.isMember ? "text-muted3" : ""}`}
                  >
                    {!p.isMember && <option value="">Not on this board</option>}
                    {ROLES.map((r) => (
                      <option key={r} value={r}>
                        {ROLE_LABEL[r]}
                      </option>
                    ))}
                  </select>
                  {p.isMember && (
                    <button
                      onClick={() => removeFromBoard(p)}
                      title="Remove from this board"
                      className="text-muted4 hover:text-accent text-[13px] opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      ⊘
                    </button>
                  )}
                </div>
                <div>
                  {p.active ? (
                    <span
                      className="inline-flex items-center gap-[6px] font-mono text-[10px] tracking-[.04em] text-good border border-good/40 px-[8px] py-[3px]"
                      title={p.firstLoginAt ? `First signed in ${new Date(p.firstLoginAt).toLocaleDateString()}` : "Active"}
                    >
                      <span className="w-[6px] h-[6px] rounded-full bg-good inline-block" />
                      ACTIVE
                    </span>
                  ) : (
                    <span
                      className="inline-flex items-center gap-[6px] font-mono text-[10px] tracking-[.04em] text-amberText border border-amberBorder bg-amberBg px-[8px] py-[3px]"
                      title="Invited but hasn't signed in yet"
                    >
                      <span className="w-[6px] h-[6px] rounded-full bg-amberText inline-block" />
                      INVITED
                    </span>
                  )}
                </div>
                <div className="flex justify-center">
                  <button
                    onClick={() => toggleAdmin(p)}
                    className={`w-[36px] h-[20px] rounded-full transition-colors relative ${
                      p.isAdmin ? "bg-accent" : "bg-border"
                    }`}
                    title="Toggle admin"
                  >
                    <span
                      className={`absolute top-[2px] w-[16px] h-[16px] rounded-full bg-white transition-all ${
                        p.isAdmin ? "left-[18px]" : "left-[2px]"
                      }`}
                    />
                  </button>
                </div>
                <div className="flex justify-center">
                  <span className="font-mono text-[9.5px] tracking-[.06em] text-muted3 border border-border px-[6px] py-[2px]">
                    {p.source === "jira" ? "JIRA" : "MANUAL"}
                  </span>
                </div>
                <div className="flex justify-end">
                  {p.source === "manual" && (
                    <button
                      onClick={() => removePerson(p)}
                      className="text-muted4 hover:text-accent text-[15px] opacity-0 group-hover:opacity-100 transition-opacity"
                      title="Remove"
                    >
                      ×
                    </button>
                  )}
                </div>
              </div>
            ))}
            <div className="px-[30px] py-[18px] pb-10 text-[12px] text-muted2">
              Roles: PO can approve to Ready For Dev · BA can send for PO review · Developer can review &amp; comment · Viewer is read-only. Admins manage this page.
            </div>
          </>
        )}
      </div>

      {toast && <Toast message={toast} />}
    </div>
  );
}
