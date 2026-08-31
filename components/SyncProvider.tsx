"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";

// A tiny framework for optimistic actions with visible sync status.
//
// The idea: the UI updates immediately (the caller does its optimistic state
// change), and the actual network work runs through `run()`, which tracks the
// action's lifecycle — syncing → synced ✓ / failed ⚠ — and surfaces it in a
// small persistent indicator. Failed actions can be retried.
//
// This gives every action an instant feel without hiding whether Jira actually
// confirmed the change, so the tool and Jira don't silently diverge.

export type SyncStatus = "syncing" | "synced" | "failed";

type SyncTask = {
  id: string;
  label: string;
  status: SyncStatus;
  retry?: () => Promise<void>;
  at: number;
};

type SyncContextValue = {
  // Run an async action with tracked sync status. Returns the promise so
  // callers can await if they need to, but they usually don't (optimistic).
  run: (label: string, fn: () => Promise<void>) => Promise<void>;
  tasks: SyncTask[];
  dismiss: (id: string) => void;
};

const SyncContext = createContext<SyncContextValue | null>(null);

let _seq = 0;

export function SyncProvider({ children }: { children: React.ReactNode }) {
  const [tasks, setTasks] = useState<SyncTask[]>([]);
  const [outbox, setOutbox] = useState<{ pending: number; failed: number }>({ pending: 0, failed: 0 });
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const clearTimer = (id: string) => {
    const t = timers.current.get(id);
    if (t) { clearTimeout(t); timers.current.delete(id); }
  };

  const dismiss = useCallback((id: string) => {
    clearTimer(id);
    setTasks((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const scheduleAutoDismiss = useCallback((id: string, ms: number) => {
    clearTimer(id);
    const t = setTimeout(() => dismiss(id), ms);
    timers.current.set(id, t);
  }, [dismiss]);

  const run = useCallback(async (label: string, fn: () => Promise<void>) => {
    const id = `sync_${++_seq}`;
    const attempt = async () => {
      setTasks((prev) => {
        const existing = prev.find((t) => t.id === id);
        const next: SyncTask = { id, label, status: "syncing", at: Date.now(), retry: attempt };
        return existing ? prev.map((t) => (t.id === id ? next : t)) : [...prev, next];
      });
      try {
        await fn();
        setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, status: "synced" } : t)));
        scheduleAutoDismiss(id, 2000); // clear success quietly
      } catch (e) {
        setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, status: "failed" } : t)));
        // failures persist until retried or dismissed
      }
    };
    await attempt();
  }, [scheduleAutoDismiss]);

  // Jira writes are queued durably, so surface anything still unsynced or
  // failed rather than letting perceived speed imply Jira actually has it.
  useEffect(() => {
    let alive = true;
    const poll = () =>
      fetch("/api/outbox/status")
        .then((r) => r.json())
        .then((d) => {
          if (alive && typeof d?.pending === "number") {
            setOutbox({ pending: d.pending, failed: d.failed ?? 0 });
          }
        })
        .catch(() => {});
    poll();
    const t = setInterval(poll, 30_000);
    return () => { alive = false; clearInterval(t); };
  }, []);

  return (
    <SyncContext.Provider value={{ run, tasks, dismiss }}>
      {children}
      <SyncIndicator tasks={tasks} dismiss={dismiss} outbox={outbox} />
    </SyncContext.Provider>
  );
}

export function useSync() {
  const ctx = useContext(SyncContext);
  if (!ctx) {
    // Fallback so components work even outside a provider (e.g. in isolation):
    // just runs the fn without tracking.
    return {
      run: async (_label: string, fn: () => Promise<void>) => { await fn(); },
      tasks: [] as SyncTask[],
      dismiss: () => {},
    };
  }
  return ctx;
}

// Bottom-right stack of active/failed syncs. Successes flash briefly; failures
// stay with a Retry until dealt with.
function SyncIndicator({
  tasks,
  dismiss,
  outbox,
}: {
  tasks: SyncTask[];
  dismiss: (id: string) => void;
  outbox: { pending: number; failed: number };
}) {
  if (tasks.length === 0 && outbox.pending === 0 && outbox.failed === 0) return null;
  return (
    <div className="fixed right-[18px] bottom-[18px] z-[70] flex flex-col gap-2 items-end">
      {outbox.failed > 0 && (
        <div className="flex items-center gap-[10px] pl-[12px] pr-[10px] py-[9px] border border-accent text-[12.5px] shadow-sm bg-white">
          <span className="text-accent text-[12px]">⚠</span>
          <span className="text-accent">
            {outbox.failed} Jira {outbox.failed === 1 ? "write" : "writes"} failed
          </span>
        </div>
      )}
      {outbox.failed === 0 && outbox.pending > 0 && (
        <div className="flex items-center gap-[10px] pl-[12px] pr-[10px] py-[9px] border border-border text-[12.5px] shadow-sm bg-white">
          <span className="w-[7px] h-[7px] rounded-full bg-key/60 animate-pulse" />
          <span className="text-muted2">
            Syncing {outbox.pending} to Jira…
          </span>
        </div>
      )}
      {tasks.map((t) => (
        <div
          key={t.id}
          className={`flex items-center gap-[10px] pl-[12px] pr-[10px] py-[9px] border text-[12.5px] shadow-sm bg-white ${
            t.status === "failed" ? "border-accent" : t.status === "synced" ? "border-good/50" : "border-border"
          }`}
        >
          {t.status === "syncing" && <span className="w-[7px] h-[7px] rounded-full bg-key/60 animate-pulse" />}
          {t.status === "synced" && <span className="text-good text-[12px]">✓</span>}
          {t.status === "failed" && <span className="text-accent text-[12px]">⚠</span>}
          <span className={t.status === "failed" ? "text-accent" : "text-ink"}>
            {t.status === "syncing" && `Syncing ${t.label}…`}
            {t.status === "synced" && `${t.label} synced`}
            {t.status === "failed" && `${t.label} didn't sync`}
          </span>
          {t.status === "failed" && (
            <>
              <button
                onClick={() => t.retry?.()}
                className="ml-1 text-[11.5px] font-semibold text-key hover:text-accent"
              >
                Retry
              </button>
              <button
                onClick={() => dismiss(t.id)}
                className="text-muted3 hover:text-ink text-[13px] leading-none"
                title="Dismiss"
              >
                ×
              </button>
            </>
          )}
        </div>
      ))}
    </div>
  );
}
