"use client";

import { useCallback, useEffect, useState } from "react";

// Board administration.
//
// Boards are how one deployment serves several products. Access is per-person:
// a non-admin only ever sees boards they're a member of, so the membership list
// on each board IS the access control. Admins see every board and can switch
// between them freely.

type Board = {
  id: string;
  name: string;
  jiraProjectKey: string;
  backlogStatus: string;
  readyForDevStatus: string;
  pbrDonePath: string;
  isDefault: boolean;
  memberCount: number;
  storyCount: number;
};
type Member = {
  personId: string;
  role: string;
  name: string;
  email: string | null;
  isAdmin: boolean;
  authType: string;
};
type Candidate = { id: string; name: string; email: string | null };
type Verify = { ok: boolean; name?: string; storyCount?: number; statuses?: string[]; error?: string };
type ReconcileRow = {
  personId: string; name: string; email: string | null; role: string;
  isAdmin: boolean; authType: string; isContributor: boolean; hasJiraIdentity: boolean;
};

const ROLES = ["PO", "BA", "DEVELOPER", "VIEWER"];

export default function BoardsPanel() {
  const [boards, setBoards] = useState<Board[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = useCallback(() => {
    fetch("/api/boards")
      .then((r) => r.json())
      .then((d) => (Array.isArray(d?.boards) ? setBoards(d.boards) : setError(d.error || "Couldn't load boards")))
      .catch(() => setError("Couldn't load boards"));
  }, []);
  useEffect(() => { load(); }, [load]);

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <span className="text-[14px] font-semibold">Boards</span>
          <p className="m-0 text-[12px] text-muted leading-[1.5]">
            One board per product. People see only the boards they&apos;re a member of; admins see
            all of them and can switch freely.
          </p>
        </div>
        {!creating && (
          <button
            onClick={() => setCreating(true)}
            className="flex-none h-[32px] px-3 text-[12.5px] font-semibold border border-border hover:border-ink transition-colors"
          >
            + New board
          </button>
        )}
      </div>

      {error && <span className="text-[12.5px] text-accent">{error}</span>}

      {creating && <CreateBoard onDone={() => { setCreating(false); load(); }} onCancel={() => setCreating(false)} />}

      <div className="border border-borderLight">
        {!boards ? (
          <div className="px-4 py-3 text-[12.5px] text-muted2 font-mono">Loading…</div>
        ) : boards.length === 0 ? (
          <div className="px-4 py-3 text-[12.5px] text-muted3">No boards yet.</div>
        ) : (
          boards.map((b) => (
            <div key={b.id} className="border-b border-borderFaint last:border-b-0">
              <button
                onClick={() => setExpanded(expanded === b.id ? null : b.id)}
                className="w-full px-4 py-[11px] flex items-center gap-3 text-left hover:bg-cream/50 transition-colors"
              >
                <span className="font-mono text-[11px] tracking-[.05em] text-key border border-border px-[7px] py-[2px]">
                  {b.jiraProjectKey}
                </span>
                <span className="text-[13px] font-medium">{b.name}</span>
                {b.isDefault && (
                  <span className="font-mono text-[9px] tracking-[.08em] text-good border border-good/40 px-[6px] py-[1px]">
                    DEFAULT
                  </span>
                )}
                <span className="ml-auto font-mono text-[10.5px] text-muted3">
                  {b.memberCount} member{b.memberCount === 1 ? "" : "s"} · {b.storyCount} stories
                </span>
                <span className="text-muted3 text-[11px]">{expanded === b.id ? "▾" : "▸"}</span>
              </button>

              {expanded === b.id && <BoardDetail board={b} onChanged={load} />}
            </div>
          ))
        )}
      </div>
    </section>
  );
}

function CreateBoard({ onDone, onCancel }: { onDone: () => void; onCancel: () => void }) {
  const [name, setName] = useState("");
  const [key, setKey] = useState("");
  const [verify, setVerify] = useState<Verify | null>(null);
  const [checking, setChecking] = useState(false);
  const [backlogStatus, setBacklogStatus] = useState("To Do");
  const [readyStatus, setReadyStatus] = useState("Ready For Dev");
  const [pbrPath, setPbrPath] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Confirm the Jira project exists before creating anything — a typo would
  // otherwise produce a board that looks fine and silently syncs nothing.
  const check = async () => {
    if (!key.trim()) return;
    setChecking(true);
    setVerify(null);
    try {
      const res = await fetch(`/api/boards/verify-project?key=${encodeURIComponent(key)}`);
      const d = await res.json();
      setVerify(d);
      if (d.ok && !name.trim() && d.name) setName(d.name);
    } finally {
      setChecking(false);
    }
  };

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/boards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name, jiraProjectKey: key, backlogStatus, readyForDevStatus: readyStatus, pbrDonePath: pbrPath,
        }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || "Couldn't create the board");
      onDone();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="border border-border bg-white p-4 flex flex-col gap-3">
      <span className="text-[13px] font-semibold">New board</span>

      <div className="flex gap-2 items-end">
        <label className="flex flex-col gap-[3px]">
          <span className="font-mono text-[9px] tracking-[.09em] text-muted3">JIRA PROJECT KEY</span>
          <input
            value={key}
            onChange={(e) => { setKey(e.target.value.toUpperCase()); setVerify(null); }}
            onBlur={check}
            placeholder="AMS"
            className="w-[110px] h-[34px] px-2 border border-border font-mono text-[13px] outline-none focus:border-ink"
          />
        </label>
        <button onClick={check} disabled={checking || !key.trim()}
          className="h-[34px] px-3 text-[12px] border border-border disabled:opacity-40">
          {checking ? "Checking…" : "Check"}
        </button>
        {verify && (
          <span className={`text-[12px] pb-[9px] ${verify.ok ? "text-good" : "text-accent"}`}>
            {verify.ok
              ? `Found "${verify.name}" · ${verify.storyCount} stories`
              : verify.error}
          </span>
        )}
      </div>

      <label className="flex flex-col gap-[3px]">
        <span className="font-mono text-[9px] tracking-[.09em] text-muted3">BOARD NAME</span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Accounts Monitoring Service"
          className="h-[34px] px-2 border border-border text-[13px] outline-none focus:border-ink"
        />
      </label>

      <div className="flex gap-2">
        <label className="flex-1 flex flex-col gap-[3px]">
          <span className="font-mono text-[9px] tracking-[.09em] text-muted3">BACKLOG STATUS</span>
          {verify?.statuses?.length ? (
            <select value={backlogStatus} onChange={(e) => setBacklogStatus(e.target.value)}
              className="h-[34px] px-2 border border-border text-[13px] bg-white">
              {verify.statuses.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          ) : (
            <input value={backlogStatus} onChange={(e) => setBacklogStatus(e.target.value)}
              className="h-[34px] px-2 border border-border text-[13px] outline-none focus:border-ink" />
          )}
        </label>
        <label className="flex-1 flex flex-col gap-[3px]">
          <span className="font-mono text-[9px] tracking-[.09em] text-muted3">READY FOR DEV STATUS</span>
          {verify?.statuses?.length ? (
            <select value={readyStatus} onChange={(e) => setReadyStatus(e.target.value)}
              className="h-[34px] px-2 border border-border text-[13px] bg-white">
              {verify.statuses.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          ) : (
            <input value={readyStatus} onChange={(e) => setReadyStatus(e.target.value)}
              className="h-[34px] px-2 border border-border text-[13px] outline-none focus:border-ink" />
          )}
        </label>
      </div>

      <label className="flex flex-col gap-[3px]">
        <span className="font-mono text-[9px] tracking-[.09em] text-muted3">
          PBR-DONE PATH (comma-separated statuses, in order)
        </span>
        <input
          value={pbrPath}
          onChange={(e) => setPbrPath(e.target.value)}
          placeholder="Requirement Analysis, Requirement Documentation, Pending PO Review, Ready For Dev"
          className="h-[34px] px-2 border border-border text-[12px] outline-none focus:border-ink"
        />
      </label>

      {error && <span className="text-[12.5px] text-accent">{error}</span>}

      <div className="flex gap-2">
        <button
          onClick={submit}
          disabled={busy || !name.trim() || !key.trim() || verify?.ok === false}
          className="h-[34px] px-4 text-[12.5px] font-semibold bg-accent text-white disabled:opacity-40"
        >
          {busy ? "Creating…" : "Create board"}
        </button>
        <button onClick={onCancel} className="h-[34px] px-3 text-[12.5px] border border-border">Cancel</button>
      </div>
      <p className="m-0 text-[11px] text-muted3 leading-[1.5]">
        You&apos;ll be added as PO so the board isn&apos;t created unreachable. The project key
        can&apos;t be changed later — stories, roadmap items and the Jira projection are all keyed
        to it.
      </p>
    </div>
  );
}

function BoardDetail({ board, onChanged }: { board: Board; onChanged: () => void }) {
  const [members, setMembers] = useState<Member[] | null>(null);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [addId, setAddId] = useState("");
  const [recon, setRecon] = useState<{ suggested: ReconcileRow[]; contributorCount: number; memberCount: number } | null>(null);
  const [reconBusy, setReconBusy] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [addRole, setAddRole] = useState("VIEWER");
  const [note, setNote] = useState<string | null>(null);

  const load = useCallback(() => {
    fetch(`/api/boards/${board.id}/members`)
      .then((r) => r.json())
      .then((d) => { setMembers(d.members ?? []); setCandidates(d.candidates ?? []); })
      .catch(() => {});
  }, [board.id]);
  useEffect(() => { load(); }, [load]);

  const add = async () => {
    if (!addId) return;
    await fetch(`/api/boards/${board.id}/members`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ personId: addId, role: addRole }),
    });
    setAddId("");
    load();
    onChanged();
  };

  const setRole = async (personId: string, role: string) => {
    setMembers((prev) => prev?.map((m) => (m.personId === personId ? { ...m, role } : m)) || prev);
    await fetch(`/api/boards/${board.id}/members`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ personId, role }),
    });
  };

  const remove = async (personId: string) => {
    setMembers((prev) => prev?.filter((m) => m.personId !== personId) || prev);
    await fetch(`/api/boards/${board.id}/members`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ personId }),
    });
    load();
    onChanged();
  };

  // Compare membership against who has actually worked on the Jira project.
  const reviewAccess = async () => {
    setReconBusy(true);
    setNote(null);
    try {
      const res = await fetch(`/api/boards/${board.id}/reconcile`);
      const d = await res.json();
      if (!res.ok) { setNote(d.error || "Couldn't review"); return; }
      setRecon({ suggested: d.suggested ?? [], contributorCount: d.contributorCount, memberCount: d.memberCount });
      setPicked(new Set((d.suggested ?? []).map((r: ReconcileRow) => r.personId)));
    } finally {
      setReconBusy(false);
    }
  };

  const removePicked = async () => {
    if (picked.size === 0) return;
    setReconBusy(true);
    try {
      await fetch(`/api/boards/${board.id}/reconcile`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ personIds: Array.from(picked) }),
      });
      setRecon(null);
      setPicked(new Set());
      load();
      onChanged();
    } finally {
      setReconBusy(false);
    }
  };

  const makeDefault = async () => {
    await fetch(`/api/boards/${board.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isDefault: true }),
    });
    onChanged();
  };

  const del = async () => {
    if (!window.confirm(`Delete "${board.name}"? This can't be undone.`)) return;
    const res = await fetch(`/api/boards/${board.id}`, { method: "DELETE" });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) { setNote(d.error || "Couldn't delete"); return; }
    onChanged();
  };

  return (
    <div className="px-4 pb-4 pt-1 bg-cream/30 flex flex-col gap-3">
      <div className="flex gap-4 font-mono text-[10.5px] text-muted3">
        <span>backlog: {board.backlogStatus}</span>
        <span>ready: {board.readyForDevStatus}</span>
        {board.pbrDonePath && <span className="truncate">path: {board.pbrDonePath}</span>}
      </div>

      <div className="flex flex-col gap-1">
        <span className="font-mono text-[9px] tracking-[.09em] text-muted3">WHO CAN SEE THIS BOARD</span>
        {!members ? (
          <span className="text-[12px] text-muted2 font-mono">Loading…</span>
        ) : members.length === 0 ? (
          <span className="text-[12px] text-muted3">
            No members yet — only admins can see this board.
          </span>
        ) : (
          members.map((m) => (
            <div key={m.personId} className="flex items-center gap-3 text-[12.5px] py-[3px]">
              <span className="font-medium">{m.name}</span>
              <span className="text-muted3 text-[11.5px]">{m.email}</span>
              {m.isAdmin && (
                <span className="font-mono text-[8.5px] tracking-[.06em] text-key border border-border px-[5px]">
                  ADMIN
                </span>
              )}
              {m.authType === "local" && (
                <span className="font-mono text-[8.5px] tracking-[.06em] text-muted3 border border-border px-[5px]">
                  STAKEHOLDER
                </span>
              )}
              <select
                value={m.role}
                onChange={(e) => setRole(m.personId, e.target.value)}
                className="ml-auto h-[26px] px-1 border border-border text-[11.5px] bg-white"
              >
                {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
              <button onClick={() => remove(m.personId)} className="text-muted4 hover:text-accent text-[13px]">×</button>
            </div>
          ))
        )}
      </div>

      <div className="flex gap-2 items-center">
        <select value={addId} onChange={(e) => setAddId(e.target.value)}
          className="h-[30px] px-2 border border-border text-[12px] bg-white min-w-[200px]">
          <option value="">Add someone…</option>
          {candidates.map((c) => <option key={c.id} value={c.id}>{c.name}{c.email ? ` · ${c.email}` : ""}</option>)}
        </select>
        <select value={addRole} onChange={(e) => setAddRole(e.target.value)}
          className="h-[30px] px-1 border border-border text-[12px] bg-white">
          {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
        <button onClick={add} disabled={!addId}
          className="h-[30px] px-3 text-[12px] font-semibold bg-ink text-white disabled:opacity-40">
          Add
        </button>
      </div>

      {note && <span className="text-[12px] text-accent">{note}</span>}

      {recon && (
        <div className="border border-amberBorder bg-amberBg p-3 flex flex-col gap-2">
          <span className="text-[12.5px] font-semibold text-amberTextDark">
            {recon.memberCount} members · {recon.contributorCount} people have actually worked on{" "}
            {board.jiraProjectKey}
          </span>
          {recon.suggested.length === 0 ? (
            <span className="text-[12px] text-amberTextDark">
              Every member with a Jira identity is a contributor. Nothing to clean up.
            </span>
          ) : (
            <>
              <p className="m-0 text-[12px] text-amberTextDark leading-[1.5]">
                {recon.suggested.length} members have never been an assignee or reporter here —
                likely added by a bulk sync. Admins and stakeholder accounts are excluded, since
                they legitimately may not appear in Jira issues. Untick anyone who should stay.
              </p>
              <div className="max-h-[220px] overflow-y-auto flex flex-col gap-[2px] bg-white/60 p-2">
                {recon.suggested.map((r) => (
                  <label key={r.personId} className="flex items-center gap-2 text-[12px] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={picked.has(r.personId)}
                      onChange={(e) => {
                        const next = new Set(picked);
                        e.target.checked ? next.add(r.personId) : next.delete(r.personId);
                        setPicked(next);
                      }}
                    />
                    <span className="font-medium">{r.name}</span>
                    <span className="text-muted3">{r.email}</span>
                    <span className="ml-auto font-mono text-[10px] text-muted3">{r.role}</span>
                  </label>
                ))}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={removePicked}
                  disabled={reconBusy || picked.size === 0}
                  className="h-[30px] px-3 text-[12px] font-semibold bg-accent text-white disabled:opacity-40"
                >
                  Remove {picked.size} from this board
                </button>
                <button onClick={() => setRecon(null)} className="h-[30px] px-3 text-[12px] border border-border">
                  Cancel
                </button>
              </div>
            </>
          )}
        </div>
      )}

      <div className="flex gap-3 pt-1">
        <button onClick={reviewAccess} disabled={reconBusy} className="text-[12px] text-key hover:text-accent disabled:opacity-50">
          {reconBusy ? "Checking…" : "Review access against Jira"}
        </button>
        {!board.isDefault && (
          <button onClick={makeDefault} className="text-[12px] text-key hover:text-accent">
            Make default board
          </button>
        )}
        <button onClick={del} className="text-[12px] text-muted2 hover:text-accent ml-auto">
          Delete board
        </button>
      </div>
    </div>
  );
}
