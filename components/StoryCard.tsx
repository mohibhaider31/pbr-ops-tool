"use client";

import { useState } from "react";
import type { Story } from "@/lib/types";

const stageLabel: Record<Story["stage"], { text: string; className: string }> = {
  BACKLOG: { text: "Backlog", className: "bg-[#eef0f6] text-[#5b6178]" },
  ASSIGNED: { text: "Assigned", className: "bg-[#e6ecff] text-[#022DEC]" },
  IN_REVIEW: { text: "Ready for PBR", className: "bg-[#fff4d9] text-[#8a5a00]" },
  PBR_DONE: { text: "PBR Done", className: "bg-[#dcfbe6] text-[#0a7a3d]" },
};

export default function StoryCard({
  story,
  rank,
  onMoveUp,
  onMoveDown,
  onChanged,
}: {
  story: Story;
  rank: number;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onChanged: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [assigneeInput, setAssigneeInput] = useState("");
  const [commentInput, setCommentInput] = useState("");
  const [busy, setBusy] = useState(false);

  const stage = stageLabel[story.stage];

  const submitAssignees = async () => {
    const names = assigneeInput
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .map((entry) => {
        // accepts "Name <email>" or just "email"
        const match = entry.match(/^(.*)<(.+)>$/);
        if (match) return { name: match[1].trim(), email: match[2].trim() };
        return { name: entry, email: entry };
      });
    setBusy(true);
    await fetch(`/api/stories/${story.jiraKey}/assign`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ assignees: [...story.assignees.map(a=>({name:a.name,email:a.email})), ...names] }),
    });
    setAssigneeInput("");
    setBusy(false);
    onChanged();
  };

  const removeAssignee = async (email: string) => {
    setBusy(true);
    const remaining = story.assignees.filter((a) => a.email !== email).map((a) => ({ name: a.name, email: a.email }));
    await fetch(`/api/stories/${story.jiraKey}/assign`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ assignees: remaining }),
    });
    setBusy(false);
    onChanged();
  };

  const submitComment = async (isQuestion: boolean) => {
    if (!commentInput.trim()) return;
    setBusy(true);
    await fetch(`/api/stories/${story.jiraKey}/comment`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        author: "You", // wire up real auth/session later
        text: commentInput,
        isQuestion,
        syncToJira: true,
      }),
    });
    setCommentInput("");
    setBusy(false);
    onChanged();
  };

  const markPbrDone = async () => {
    if (!confirm(`Mark ${story.jiraKey} as PBR done? This moves it to Ready for Dev in Jira.`)) return;
    setBusy(true);
    const res = await fetch(`/api/stories/${story.jiraKey}/pbr-done`, { method: "POST" });
    const data = await res.json();
    setBusy(false);
    if (data.error) alert(data.error);
    onChanged();
  };

  const allReviewed = story.assignees.length > 0 && story.assignees.every((a) => a.markedDone);

  return (
    <div className="rounded-lg border border-[#e1e4ec] bg-white overflow-hidden">
      <div className="flex items-center gap-3 px-4 py-3">
        <div className="flex flex-col text-[#b7bccc]">
          <button onClick={onMoveUp} className="hover:text-royal leading-none text-xs" aria-label="Move up">▲</button>
          <button onClick={onMoveDown} className="hover:text-royal leading-none text-xs" aria-label="Move down">▼</button>
        </div>
        <div className="text-xs font-mono text-[#8890a6] w-6 text-center">{rank}</div>

        <button className="flex-1 text-left" onClick={() => setOpen(!open)}>
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono text-royal">{story.jiraKey}</span>
            <span className="text-sm font-medium text-[#12142b]">{story.jira.summary}</span>
          </div>
        </button>

        {story.jira.storyPoints != null && (
          <span className="text-xs font-mono text-[#8890a6] bg-[#f2f3f7] px-2 py-0.5 rounded">
            {story.jira.storyPoints} SP
          </span>
        )}

        <span className={`text-xs px-2 py-1 rounded-full ${stage.className}`}>{stage.text}</span>

        <button
          onClick={() => setOpen(!open)}
          className="text-[#8890a6] text-sm px-2"
          aria-label="Expand"
        >
          {open ? "–" : "+"}
        </button>
      </div>

      {open && (
        <div className="border-t border-[#e1e4ec] px-4 py-4 bg-[#fafbfd] space-y-4">
          {/* Assignees */}
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-[#8890a6] mb-2">
              Assigned reviewers
            </div>
            <div className="flex flex-wrap gap-2 mb-2">
              {story.assignees.map((a) => (
                <span
                  key={a.email}
                  className={`text-xs px-2 py-1 rounded-full flex items-center gap-1 ${
                    a.markedDone ? "bg-[#dcfbe6] text-[#0a7a3d]" : "bg-[#eef0f6] text-[#5b6178]"
                  }`}
                >
                  {a.markedDone ? "✓ " : ""}
                  {a.name}
                  <button onClick={() => removeAssignee(a.email)} className="ml-1 text-[#8890a6] hover:text-red-600">
                    ×
                  </button>
                </span>
              ))}
              {story.assignees.length === 0 && (
                <span className="text-xs text-[#b7bccc]">No one assigned yet</span>
              )}
            </div>
            <div className="flex gap-2">
              <input
                value={assigneeInput}
                onChange={(e) => setAssigneeInput(e.target.value)}
                placeholder="Name <email>, Name <email>"
                className="flex-1 text-sm px-3 py-1.5 rounded-md border border-[#d7dae3] focus:outline-none focus:ring-2 focus:ring-royal/30"
              />
              <button
                disabled={busy || !assigneeInput.trim()}
                onClick={submitAssignees}
                className="text-sm px-3 py-1.5 rounded-md bg-navy text-white disabled:opacity-40"
              >
                Assign
              </button>
            </div>
          </div>

          {/* Comments */}
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-[#8890a6] mb-2">
              Comments & questions
            </div>
            <div className="space-y-2 mb-2 max-h-48 overflow-y-auto">
              {story.comments.map((c) => (
                <div key={c.id} className="text-sm">
                  <span className={c.isQuestion ? "text-[#8a5a00]" : "text-[#5b6178]"}>
                    {c.isQuestion ? "❓ " : ""}
                    <span className="font-medium">{c.author}:</span> {c.text}
                  </span>
                </div>
              ))}
              {story.comments.length === 0 && (
                <div className="text-xs text-[#b7bccc]">No comments yet</div>
              )}
            </div>
            <div className="flex gap-2">
              <input
                value={commentInput}
                onChange={(e) => setCommentInput(e.target.value)}
                placeholder="Add a comment or question…"
                className="flex-1 text-sm px-3 py-1.5 rounded-md border border-[#d7dae3] focus:outline-none focus:ring-2 focus:ring-royal/30"
                onKeyDown={(e) => e.key === "Enter" && submitComment(false)}
              />
              <button
                disabled={busy}
                onClick={() => submitComment(false)}
                className="text-sm px-3 py-1.5 rounded-md border border-[#d7dae3] text-[#5b6178]"
              >
                Comment
              </button>
              <button
                disabled={busy}
                onClick={() => submitComment(true)}
                className="text-sm px-3 py-1.5 rounded-md border border-[#f0d38a] text-[#8a5a00]"
              >
                Ask
              </button>
            </div>
          </div>

          {/* PBR done */}
          <div className="flex items-center justify-between pt-2 border-t border-[#e1e4ec]">
            <span className="text-xs text-[#8890a6]">
              {allReviewed
                ? "All reviewers have marked this done — ready to discuss in PBR."
                : "Waiting on one or more reviewers to mark done."}
            </span>
            <button
              disabled={busy || story.stage === "PBR_DONE"}
              onClick={markPbrDone}
              className="text-sm px-3 py-1.5 rounded-md bg-royal text-white disabled:opacity-40"
            >
              {story.stage === "PBR_DONE" ? "PBR Done ✓" : "Mark PBR Done → Ready for Dev"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
