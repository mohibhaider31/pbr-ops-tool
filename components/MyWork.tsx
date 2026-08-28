"use client";

import { useCallback, useEffect, useState } from "react";
import StoryDrawer from "./StoryDrawer";
import Toast from "./Toast";

type ReviewRow = { jiraKey: string; summary?: string; stage: string; myReviewDone: boolean; reviewProgress: string; questionCount: number };
type QuestionRow = { jiraKey: string; text: string; createdAt: string };
type JiraRow = { jiraKey: string; summary: string; status: string; storyPoints: number | null; done: boolean };
type MentionRow = { jiraKey: string; summary: string; commentId: string; author: string; text: string; createdAt: string };
type Data = {
  viewerName: string;
  needsReview: ReviewRow[];
  waitingOnOthers: ReviewRow[];
  openQuestions: QuestionRow[];
  jiraAssigned: JiraRow[];
  mentions: MentionRow[];
};

export default function MyWork() {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openStory, setOpenStory] = useState<any | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [showDone, setShowDone] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch("/api/my-work");
    const d = await res.json();
    if (d.error) setError(d.error);
    else setData(d);
  }, []);
  useEffect(() => { load(); }, [load]);

  const showToast = (m: string) => { setToast(m); setTimeout(() => setToast(null), 2600); };

  const openDrawer = async (jiraKey: string) => {
    const res = await fetch(`/api/stories/${jiraKey}`);
    const d = await res.json();
    if (d.story) setOpenStory(d.story);
    else showToast(d.error || "Could not open story");
  };

  const dismissMention = async (m: MentionRow) => {
    // optimistic: remove from list immediately
    setData((prev) => prev ? { ...prev, mentions: prev.mentions.filter((x) => x.commentId !== m.commentId) } : prev);
    await fetch("/api/my-work/dismiss-mention", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jiraKey: m.jiraKey, commentId: m.commentId }),
    }).catch(() => showToast("Couldn't dismiss — try again"));
  };

  if (error) return <div className="p-8"><div className="border border-amberBorder bg-amberBg p-4 text-sm text-amberTextDark">{error}</div></div>;
  if (!data) return <div className="p-8 text-sm text-muted2 font-mono">Loading your work…</div>;

  const totalItems = data.needsReview.length + data.waitingOnOthers.length + data.openQuestions.length + data.jiraAssigned.length + (data.mentions?.length ?? 0);

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <header className="px-[30px] pt-6 pb-4 border-b border-border">
        <h1 className="m-0 text-[25px] font-semibold tracking-[-0.025em]">My Work</h1>
        <p className="m-0 mt-[5px] text-[12.5px] text-muted">
          Everything assigned to you — review stories, raise questions, and track what you&apos;re waiting on.
        </p>
      </header>

      <div className="flex-1 overflow-y-auto px-[30px] py-6 flex flex-col gap-8 max-w-[860px]">
        {totalItems === 0 && (
          <div className="border border-dashed border-border bg-cream px-8 py-12 text-center">
            <span className="text-[15px] font-semibold">Nothing assigned right now</span>
            <p className="m-0 mt-2 text-[13px] text-muted">When you&apos;re added as a reviewer or assigned a story in Jira, it&apos;ll show up here.</p>
          </div>
        )}

        {/* Needs my review — with hint when empty */}
        {data.needsReview.length > 0 ? (
          <Section title="Needs my review" count={data.needsReview.length} tone="accent">
            {data.needsReview.map((r) => (
              <StoryLine key={r.jiraKey} jiraKey={r.jiraKey} summary={r.summary} onClick={() => openDrawer(r.jiraKey)}
                right={<>
                  <Meta label={`review ${r.reviewProgress}`} />
                  {r.questionCount > 0 && <Meta label={`${r.questionCount} Q`} tone="amber" />}
                </>} />
            ))}
          </Section>
        ) : totalItems > 0 ? (
          <EmptyHint title="Needs my review" tone="accent" text="Nothing assigned to you for review yet. When a PO or BA adds you as a reviewer on a story, it'll show up here to read and comment on." />
        ) : null}

        {/* Mentions — Jira comments where I was @-tagged */}
        {data.mentions && data.mentions.length > 0 && (
          <Section title="You were mentioned" count={data.mentions.length} tone="accent">
            {data.mentions.map((m) => (
              <div key={m.commentId} className="flex items-start gap-3 px-4 py-3 border-b border-borderFaint last:border-b-0 hover:bg-cream transition-colors">
                <button onClick={() => openDrawer(m.jiraKey)} className="flex-1 text-left flex flex-col gap-[3px] min-w-0">
                  <span className="flex items-center gap-2">
                    <span className="font-mono text-[12px] font-medium text-key">{m.jiraKey}</span>
                    <span className="text-[12px] text-muted2 overflow-hidden text-ellipsis whitespace-nowrap">{m.summary}</span>
                  </span>
                  <span className="text-[13px] text-ink leading-[1.5]">
                    <span className="text-muted2">{m.author}:</span> {m.text}
                  </span>
                </button>
                <button
                  onClick={() => dismissMention(m)}
                  className="flex-none text-[11px] font-semibold text-muted2 hover:text-good border border-border hover:border-good px-[9px] py-[4px] transition-colors"
                  title="Mark as handled — removes it unless you're tagged again"
                >
                  Done
                </button>
              </div>
            ))}
          </Section>
        )}

        {/* Waiting on others (only when present — no hint needed) */}
        {data.waitingOnOthers.length > 0 && (
          <Section title="Waiting on others" count={data.waitingOnOthers.length} tone="muted">
            {data.waitingOnOthers.map((r) => (
              <StoryLine key={r.jiraKey} jiraKey={r.jiraKey} summary={r.summary} onClick={() => openDrawer(r.jiraKey)}
                right={<Meta label={`review ${r.reviewProgress}`} />} muted />
            ))}
          </Section>
        )}

        {/* My open questions — with hint when empty */}
        {data.openQuestions.length > 0 ? (
          <Section title="My open questions" count={data.openQuestions.length} tone="amber">
            {data.openQuestions.map((q, i) => (
              <button key={i} onClick={() => openDrawer(q.jiraKey)} className="w-full text-left flex items-start gap-3 px-4 py-3 border-b border-borderFaint last:border-b-0 hover:bg-cream transition-colors">
                <span className="font-mono text-[12px] font-medium text-key w-[64px] flex-none pt-[1px]">{q.jiraKey}</span>
                <span className="text-[13px] text-ink flex-1 leading-[1.5]">{q.text}</span>
              </button>
            ))}
          </Section>
        ) : totalItems > 0 ? (
          <EmptyHint title="My open questions" tone="amber" text="No open questions from you. When you raise a question on a story, it'll be tracked here until it's resolved." />
        ) : null}

        {/* Jira-assigned to me — active first, done collapsed */}
        {data.jiraAssigned.length > 0 && (() => {
          const active = data.jiraAssigned.filter((r) => !r.done);
          const done = data.jiraAssigned.filter((r) => r.done);
          return (
            <Section title="Assigned to me in Jira" count={data.jiraAssigned.length} tone="muted">
              {active.map((r) => (
                <StoryLine key={r.jiraKey} jiraKey={r.jiraKey} summary={r.summary} onClick={() => openDrawer(r.jiraKey)}
                  right={<>
                    <StatusLabel status={r.status} />
                    {r.storyPoints != null && <Meta label={`${r.storyPoints} pts`} />}
                  </>} />
              ))}
              {active.length === 0 && done.length > 0 && (
                <div className="px-4 py-3 text-[12.5px] text-muted3">No active stories — all {done.length} assigned to you are completed.</div>
              )}
              {done.length > 0 && (
                <>
                  <button
                    onClick={() => setShowDone((v) => !v)}
                    className="w-full text-left px-4 h-[38px] flex items-center gap-2 border-t border-borderFaint bg-cream/50 hover:bg-cream transition-colors"
                  >
                    <span className="font-mono text-[10px] tracking-[.06em] text-muted2">{showDone ? "▾" : "▸"}</span>
                    <span className="font-mono text-[10.5px] tracking-[.06em] text-muted2">COMPLETED ({done.length})</span>
                  </button>
                  {showDone && done.map((r) => (
                    <StoryLine key={r.jiraKey} jiraKey={r.jiraKey} summary={r.summary} onClick={() => openDrawer(r.jiraKey)} muted
                      right={<>
                        <StatusLabel status={r.status} />
                        {r.storyPoints != null && <Meta label={`${r.storyPoints} pts`} />}
                      </>} />
                  ))}
                </>
              )}
            </Section>
          );
        })()}
      </div>

      {openStory && (
        <StoryDrawer story={openStory} onClose={() => setOpenStory(null)} onChanged={() => { load(); openDrawer(openStory.jiraKey); }} onToast={showToast} />
      )}
      {toast && <Toast message={toast} />}
    </div>
  );
}

function Section({ title, count, tone, children }: { title: string; count: number; tone: "accent" | "amber" | "muted"; children: React.ReactNode }) {
  const dot = tone === "accent" ? "bg-accent" : tone === "amber" ? "bg-amberText" : "bg-muted3";
  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center gap-[9px]">
        <span className={`w-[7px] h-[7px] rounded-full ${dot}`} />
        <h2 className="m-0 text-[15px] font-semibold">{title}</h2>
        <span className="font-mono text-[11px] text-muted2 bg-white border border-border px-[7px] py-[1px]">{count}</span>
      </div>
      <div className="border border-borderLight bg-white">{children}</div>
    </section>
  );
}

function StoryLine({ jiraKey, summary, right, onClick, muted }: { jiraKey: string; summary?: string; right?: React.ReactNode; onClick: () => void; muted?: boolean }) {
  return (
    <button onClick={onClick} className={`w-full text-left flex items-center gap-3 px-4 h-[46px] border-b border-borderFaint last:border-b-0 hover:bg-cream transition-colors ${muted ? "opacity-75" : ""}`}>
      <span className="font-mono text-[12px] font-medium text-key w-[64px] flex-none">{jiraKey}</span>
      <span className="text-[13px] flex-1 overflow-hidden text-ellipsis whitespace-nowrap">{summary || jiraKey}</span>
      <span className="flex items-center gap-2 flex-none">{right}</span>
    </button>
  );
}

function Meta({ label, tone }: { label: string; tone?: "amber" }) {
  return <span className={`font-mono text-[10px] tracking-[.03em] px-[6px] py-[2px] border ${tone === "amber" ? "border-amberBorder text-amberText bg-amberBg" : "border-border text-muted2"}`}>{label}</span>;
}

// Shown when a section has no items, to explain what will appear there.
function EmptyHint({ title, text, tone }: { title: string; text: string; tone: "accent" | "amber" | "muted" }) {
  const dot = tone === "accent" ? "bg-accent/40" : tone === "amber" ? "bg-amberText/40" : "bg-muted3";
  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center gap-[9px]">
        <span className={`w-[7px] h-[7px] rounded-full ${dot}`} />
        <h2 className="m-0 text-[15px] font-semibold text-muted2">{title}</h2>
      </div>
      <div className="border border-dashed border-border bg-cream/40 px-4 py-3">
        <p className="m-0 text-[12.5px] text-muted3 leading-[1.55]">{text}</p>
      </div>
    </section>
  );
}

// Jira status shown as a plain, clearly non-interactive label (a dot + text),
// so it doesn't read like a clickable "Done" button.
function StatusLabel({ status }: { status: string }) {
  const s = status.toLowerCase();
  const done = s === "done" || s === "closed" || s === "resolved";
  const inProgress = s.includes("progress") || s.includes("review") || s.includes("dev");
  const dot = done ? "bg-good" : inProgress ? "bg-key" : "bg-muted3";
  return (
    <span className="inline-flex items-center gap-[6px] text-[11px] text-muted2">
      <span className={`w-[6px] h-[6px] rounded-full ${dot} inline-block`} />
      {status}
    </span>
  );
}
