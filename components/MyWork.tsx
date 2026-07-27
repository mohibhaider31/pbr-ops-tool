"use client";

import { useCallback, useEffect, useState } from "react";
import StoryDrawer from "./StoryDrawer";
import Toast from "./Toast";

type ReviewRow = { jiraKey: string; summary?: string; stage: string; myReviewDone: boolean; reviewProgress: string; questionCount: number };
type QuestionRow = { jiraKey: string; text: string; createdAt: string };
type JiraRow = { jiraKey: string; summary: string; status: string; storyPoints: number | null };
type Data = {
  viewerName: string;
  needsReview: ReviewRow[];
  waitingOnOthers: ReviewRow[];
  openQuestions: QuestionRow[];
  jiraAssigned: JiraRow[];
};

export default function MyWork() {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openStory, setOpenStory] = useState<any | null>(null);
  const [toast, setToast] = useState<string | null>(null);

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

  if (error) return <div className="p-8"><div className="border border-amberBorder bg-amberBg p-4 text-sm text-amberTextDark">{error}</div></div>;
  if (!data) return <div className="p-8 text-sm text-muted2 font-mono">Loading your work…</div>;

  const totalItems = data.needsReview.length + data.waitingOnOthers.length + data.openQuestions.length + data.jiraAssigned.length;

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

        {/* Needs my review */}
        {data.needsReview.length > 0 && (
          <Section title="Needs my review" count={data.needsReview.length} tone="accent">
            {data.needsReview.map((r) => (
              <StoryLine key={r.jiraKey} jiraKey={r.jiraKey} summary={r.summary} onClick={() => openDrawer(r.jiraKey)}
                right={<>
                  <Meta label={`review ${r.reviewProgress}`} />
                  {r.questionCount > 0 && <Meta label={`${r.questionCount} Q`} tone="amber" />}
                </>} />
            ))}
          </Section>
        )}

        {/* Waiting on others */}
        {data.waitingOnOthers.length > 0 && (
          <Section title="Waiting on others" count={data.waitingOnOthers.length} tone="muted">
            {data.waitingOnOthers.map((r) => (
              <StoryLine key={r.jiraKey} jiraKey={r.jiraKey} summary={r.summary} onClick={() => openDrawer(r.jiraKey)}
                right={<Meta label={`review ${r.reviewProgress}`} />} muted />
            ))}
          </Section>
        )}

        {/* My open questions */}
        {data.openQuestions.length > 0 && (
          <Section title="My open questions" count={data.openQuestions.length} tone="amber">
            {data.openQuestions.map((q, i) => (
              <button key={i} onClick={() => openDrawer(q.jiraKey)} className="w-full text-left flex items-start gap-3 px-4 py-3 border-b border-borderFaint last:border-b-0 hover:bg-cream transition-colors">
                <span className="font-mono text-[12px] font-medium text-key w-[64px] flex-none pt-[1px]">{q.jiraKey}</span>
                <span className="text-[13px] text-ink flex-1 leading-[1.5]">{q.text}</span>
              </button>
            ))}
          </Section>
        )}

        {/* Jira-assigned to me */}
        {data.jiraAssigned.length > 0 && (
          <Section title="Assigned to me in Jira" count={data.jiraAssigned.length} tone="muted">
            {data.jiraAssigned.map((r) => (
              <StoryLine key={r.jiraKey} jiraKey={r.jiraKey} summary={r.summary} onClick={() => openDrawer(r.jiraKey)}
                right={<>
                  <Meta label={r.status} />
                  {r.storyPoints != null && <Meta label={`${r.storyPoints} pts`} />}
                </>} />
            ))}
          </Section>
        )}
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
