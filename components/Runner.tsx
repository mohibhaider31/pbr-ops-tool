"use client";

import { useEffect, useRef, useState } from "react";

type StepState = "pending" | "active" | "done" | "error";

export default function Runner({
  jiraKey,
  path,
  onClose,
  onFinished,
}: {
  jiraKey: string;
  path: string[];
  onClose: () => void;
  onFinished: () => void;
}) {
  const [states, setStates] = useState<StepState[]>(path.map(() => "pending"));
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [finished, setFinished] = useState(false);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const run = async () => {
    for (let i = 0; i < path.length; i++) {
      setStates((prev) => prev.map((s, idx) => (idx === i ? "active" : s)));
      try {
        const res = await fetch(`/api/stories/${jiraKey}/transition`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ to: path[i] }),
        });
        const data = await res.json();
        if (data.error) throw new Error(data.error);
        setStates((prev) => prev.map((s, idx) => (idx === i ? "done" : s)));
      } catch (e: any) {
        setStates((prev) => prev.map((s, idx) => (idx === i ? "error" : s)));
        setErrorMsg(e.message);
        return;
      }
    }
    await fetch(`/api/stories/${jiraKey}/complete`, { method: "POST" });
    setFinished(true);
  };

  return (
    <div className="fixed inset-0 bg-ink/50 z-[40] flex items-center justify-center">
      <div className="w-[460px] bg-white border border-[#C8C3B8] animate-riseIn">
        <div className="px-6 pt-5 pb-[14px] border-b border-borderFaint flex flex-col gap-1">
          <span className="font-mono text-[10px] tracking-[.11em] text-muted2">
            {jiraKey} · JIRA TRANSITIONS API
          </span>
          <h3 className="m-0 text-[18px] font-semibold tracking-[-0.02em]">
            {errorMsg ? "Transition blocked" : finished ? "Moved to Ready For Dev" : "Running PBR-done transition…"}
          </h3>
        </div>

        <div className="px-6 pt-[18px] pb-2 flex flex-col">
          {path.map((step, i) => {
            const state = states[i];
            return (
              <div key={step} className="flex items-center gap-[13px] py-[9px]">
                <span
                  className={`font-mono text-[11px] w-4 text-center ${
                    state === "done"
                      ? "text-good"
                      : state === "active"
                      ? "text-accent"
                      : state === "error"
                      ? "text-key"
                      : "text-muted4"
                  }`}
                >
                  {state === "done" ? "✓" : state === "error" ? "×" : state === "active" ? "…" : "○"}
                </span>
                <span
                  className={`text-[13.5px] flex-1 ${
                    state === "pending" ? "text-muted3" : "text-ink"
                  }`}
                >
                  {step}
                </span>
                <span className="font-mono text-[10.5px] text-muted3">
                  {state === "done" ? "200 OK" : state === "active" ? "POST…" : state === "error" ? "FAILED" : ""}
                </span>
              </div>
            );
          })}
        </div>

        <div className="px-6 pb-5 pt-3 flex items-center gap-[10px]">
          <span className="text-[12px] text-muted flex-1 leading-[1.5]">
            {errorMsg
              ? errorMsg
              : finished
              ? "All hops applied. Story metadata updated in this tool too."
              : "Walking the issue through each workflow status in order."}
          </span>
          {(finished || errorMsg) && (
            <button
              type="button"
              onClick={() => {
                onClose();
                if (finished) onFinished();
              }}
              className="h-[34px] px-4 bg-ink text-white text-[12.5px] font-semibold"
            >
              {finished ? "Done" : "Close"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
