"use client";

import { useEffect, useState, useCallback } from "react";
import StoryCard from "./StoryCard";
import type { Story } from "@/lib/types";

export default function BacklogBoard() {
  const [stories, setStories] = useState<Story[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/jira/backlog");
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setStories(data.stories);
      setError(null);
    } catch (e: any) {
      setError(e.message);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const move = async (jiraKey: string, direction: -1 | 1) => {
    if (!stories) return;
    const idx = stories.findIndex((s) => s.jiraKey === jiraKey);
    const newIdx = idx + direction;
    if (newIdx < 0 || newIdx >= stories.length) return;

    // optimistic reorder
    const next = [...stories];
    [next[idx], next[newIdx]] = [next[newIdx], next[idx]];
    setStories(next);

    await fetch(`/api/stories/${jiraKey}/priority`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ newOrder: newIdx }),
    });
    load();
  };

  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
        Couldn&apos;t load the backlog: {error}
        <div className="mt-1 text-red-600">
          Check JIRA_BASE_URL / JIRA_EMAIL / JIRA_API_TOKEN / JIRA_PROJECT_KEY in your environment.
        </div>
      </div>
    );
  }

  if (!stories) {
    return <div className="text-sm text-[#8890a6]">Loading backlog…</div>;
  }

  if (stories.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-[#d7dae3] p-8 text-center text-sm text-[#8890a6]">
        No stories currently sit in the Backlog status in Jira.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {stories.map((story, idx) => (
        <StoryCard
          key={story.jiraKey}
          story={story}
          rank={idx + 1}
          onMoveUp={() => move(story.jiraKey, -1)}
          onMoveDown={() => move(story.jiraKey, 1)}
          onChanged={load}
        />
      ))}
    </div>
  );
}
