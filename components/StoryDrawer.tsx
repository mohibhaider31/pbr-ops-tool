"use client";

import { useEffect, useState } from "react";
import type { Story } from "@/lib/types";
import { STAGE_META } from "@/lib/stage";
import { avatarColor, initials } from "@/lib/avatar";
import Runner from "./Runner";

export default function StoryDrawer({
  story,
  onClose,
  onChanged,
  onToast,
}: {
  story: Story;
  onClose: () => void;
  onChanged: () => void;
  onToast: (msg: string) => void;
}) {
  const [assigneeInput, setAssigneeInput] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [mirror, setMirror] = useState(true);
  const [busy, setBusy] = useState(false);
  const [pbrPath, setPbrPath] = useState<string[]>([]);
  const [runnerOpen, setRunnerOpen] = useState(false);

  useEffect(() => {
    fetch("/api/config")
      .then((r) => r.json())
      .then((d) => setPbrPath(d.pbrDonePath || []));
  }, []);

  const meta = STAGE_META[story.stage];
  const doneCount = story.assignees.filter((a) => a.markedDone).length;
  const allReviewed = story.assignees.length > 0 && doneCount === story.assignees.length;
  // "You" stands in for a real logged-in identity until auth is wired up.
  const myEmail = "you@local";
  const myAssignment = story.assignees.find((a) => a.email === myEmail);

  const submitAssignees = async () => {
    const names = assigneeInput
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .map((entry) => {
        const match = entry.match(/^(.*)<(.+)>$/);
        if (match) return { name: match[1].trim(), email: match[2].trim() };
        return { name: entry, email: entry };
      });
    setBusy(true);
    await fetch(`/api/stories/${story.jiraKey}/assign`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        assignees: [...story.assignees.map((a) => ({ name: a.name, email: a.email })), ...names],
      }),
    });
    setAssigneeInput("");
    setAddOpen(false);
    setBusy(false);
    onChanged();
  };

  const removeAssignee = async (email: string) => {
    setBusy(true);
    const remaining = story.assignees
      .filter((a) => a.email !== email)
      .map((a) => ({ name: a.name, email: a.email }));
    await fetch(`/api/stories/${story.jiraKey}/assign`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ assignees: remaining }),
    });
    setBusy(false);
    onChanged();
  };

  const toggleMyReview = async () => {
    setBusy(true);
    await fetch(`/api/stories/${story.jiraKey}/assign`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: myEmail }),
    });
    setBusy(false);
    onChanged();
  };

  const submitComment = async (isQuestion: boolean) => {
    if (!draft.trim()) return;
    setBusy(true);
    await fetch(`/api/stories/${story.jiraKey}/comment`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ author: "You", text: draft, isQuestion, syncToJira: mirror }),
    });
    setDraft("");
    setBusy(false);
    onChanged();
  };

  return (
    <>
      <div onClick={onClose} className="fixed inset-0 bg-ink/[.28] z-[20]" />
      <aside className="fixed top-0 right-0 bottom-0 w-[520px] bg-white border-l border-[#C8C3B8] z-[21] flex flex-col overflow-hidden animate-riseIn">
        <div className="px-6 pt-5 pb-4 border-b border-borderLight flex flex-col gap-[11px]">
          <div className="flex items-center gap-[10px]">
            <span className="font-mono text-[13px] font-bold text-key">{story.jiraKey}</span>
            <span className={`font-mono text-[9.5px] tracking-[.08em] border px-[7px] py-[3px] ${meta.pillClass}`}>
              {meta.label.toUpperCase()}
            </span>
            <div className="flex-1" />
            <a
              href={`https://logicielservices.atlassian.net/browse/${story.jiraKey}`}
              target="_blank"
              rel="noreferrer"
              className="font-mono text-[10.5px] tracking-[.06em] text-muted"
            >
              OPEN IN JIRA ↗
            </a>
            <button onClick={onClose} className="bg-transparent border-none text-[17px] text-muted2 cursor-pointer leading-none px-[2px]">
              ×
            </button>
          </div>
          <h2 className="m-0 text-[20px] font-semibold tracking-[-0.02em] leading-[1.25]">
            {story.jira.summary}
          </h2>
          <div className="flex gap-[18px] font-mono text-[11px] text-muted">
            <span>{story.jira.storyPoints ?? "–"} PTS</span>
            <span>{story.jira.issueType}</span>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {/* Reviewers */}
          <div className="px-6 py-4 border-b border-borderFaint flex flex-col gap-[11px]">
            <div className="flex items-center justify-between">
              <span className="font-mono text-[9.5px] tracking-[.11em] text-muted2">
                REVIEWERS · {doneCount}/{story.assignees.length}
              </span>
              <button
                onClick={() => setAddOpen(!addOpen)}
                className="bg-transparent border-none text-[12px] font-medium text-key cursor-pointer p-0"
              >
                + Assign
              </button>
            </div>

            {addOpen && (
              <div className="border border-border bg-cream p-[9px] flex flex-col gap-2">
                <input
                  value={assigneeInput}
                  onChange={(e) => setAssigneeInput(e.target.value)}
                  placeholder="Name <email>, Name <email>"
                  className="text-[13px] px-[9px] py-[6px] border border-border bg-white outline-none"
                  onKeyDown={(e) => e.key === "Enter" && submitAssignees()}
                />
                <button
                  disabled={busy || !assigneeInput.trim()}
                  onClick={submitAssignees}
                  className="h-[30px] text-[12px] font-semibold bg-ink text-white disabled:opacity-40"
                >
                  Add
                </button>
              </div>
            )}

            <div className="flex flex-col gap-[7px]">
              {story.assignees.map((a) => (
                <div key={a.email} className="flex items-center gap-[9px]">
                  <span
                    style={{ background: avatarColor(a.email) }}
                    className="w-[22px] h-[22px] rounded-full text-white text-[9.5px] font-mono font-semibold flex items-center justify-center"
                  >
                    {initials(a.name)}
                  </span>
                  <span className="text-[13px] flex-1">{a.name}</span>
                  <span
                    className={`font-mono text-[10px] tracking-[.05em] ${
                      a.markedDone ? "text-good" : "text-muted3"
                    }`}
                  >
                    {a.markedDone ? "REVIEWED" : "PENDING"}
                  </span>
                  <button
                    onClick={() => removeAssignee(a.email)}
                    title="Unassign"
                    className="bg-transparent border-none text-[14px] text-muted4 cursor-pointer px-[2px]"
                  >
                    ×
                  </button>
                </div>
              ))}
              {story.assignees.length === 0 && (
                <span className="text-[12px] text-muted3">No one assigned yet</span>
              )}
            </div>

            {myAssignment && (
              <button
                onClick={toggleMyReview}
                disabled={busy || myAssignment.markedDone}
                className={`h-[32px] text-[12.5px] font-semibold border transition-colors ${
                  myAssignment.markedDone
                    ? "border-good/40 text-good bg-white"
                    : "border-ink text-ink bg-white hover:bg-ink hover:text-white"
                }`}
              >
                {myAssignment.markedDone ? "✓ You've reviewed this" : "Mark my review done"}
              </button>
            )}
          </div>

          {/* Comments */}
          <div className="px-6 py-4 flex flex-col gap-[13px]">
            <span className="font-mono text-[9.5px] tracking-[.11em] text-muted2">
              QUESTIONS &amp; NOTES
            </span>
            {story.comments.map((c) => (
              <div key={c.id} className="flex flex-col gap-[5px] pb-[13px] border-b border-borderFaint">
                <div className="flex items-center gap-2">
                  <span
                    style={{ background: avatarColor(c.author) }}
                    className="w-[20px] h-[20px] rounded-full text-white text-[9px] font-mono font-semibold flex items-center justify-center"
                  >
                    {initials(c.author)}
                  </span>
                  <span className="text-[12.5px] font-semibold">{c.author}</span>
                  {c.isQuestion && <span className="text-[11px]">❓</span>}
                </div>
                <p className="m-0 text-[13px] leading-[1.55] text-[#3A362F]">{c.text}</p>
              </div>
            ))}
            {story.comments.length === 0 && (
              <span className="text-[12px] text-muted3">No comments yet</span>
            )}

            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Ask a question or capture a decision…"
              className="w-full min-h-[70px] resize-none p-[10px] border border-border bg-cream text-[13px] leading-[1.5] outline-none"
            />
            <div className="flex items-center justify-between gap-[10px]">
              <button
                onClick={() => setMirror(!mirror)}
                className="flex items-center gap-[7px] bg-transparent border-none p-0 cursor-pointer text-[11.5px] text-[#4A463E]"
              >
                <span
                  className={`w-[13px] h-[13px] border flex items-center justify-center text-[9px] ${
                    mirror ? "bg-ink border-ink text-white" : "border-border"
                  }`}
                >
                  {mirror ? "✓" : ""}
                </span>
                Mirror to Jira issue
              </button>
              <div className="flex gap-2">
                <button
                  disabled={busy}
                  onClick={() => submitComment(true)}
                  className="h-[30px] px-3 text-[12px] border border-amberBorder text-amberText bg-white"
                >
                  Ask
                </button>
                <button
                  disabled={busy}
                  onClick={() => submitComment(false)}
                  className="h-[30px] px-3 text-[12px] font-semibold bg-ink text-white"
                >
                  Post
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="border-t border-borderLight px-6 pt-[14px] pb-4 flex items-center gap-3">
          <span className="text-[11.5px] text-muted2">
            {story.stage === "PBR_DONE"
              ? "Already moved to Ready For Dev."
              : allReviewed
              ? "All reviewers done — ready to discuss in PBR."
              : "Waiting on reviewers to mark done."}
          </span>
          <div className="flex-1" />
          {story.stage !== "PBR_DONE" && (
            <button
              disabled={busy || pbrPath.length === 0}
              onClick={() => setRunnerOpen(true)}
              className="h-[34px] px-4 bg-accent text-white text-[12.5px] font-semibold disabled:opacity-40"
            >
              Mark PBR Done
            </button>
          )}
        </div>
      </aside>

      {runnerOpen && pbrPath.length > 0 && (
        <Runner
          jiraKey={story.jiraKey}
          path={pbrPath}
          onClose={() => setRunnerOpen(false)}
          onFinished={() => {
            onToast(`${story.jiraKey} moved to Ready For Dev`);
            onChanged();
            onClose();
          }}
        />
      )}
    </>
  );
}
