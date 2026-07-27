import type { StoryStage } from "./types";

export const STAGE_META: Record<
  StoryStage,
  { label: string; pillClass: string }
> = {
  BACKLOG: { label: "Backlog", pillClass: "text-muted2 border-border" },
  ASSIGNED: { label: "Assigned", pillClass: "text-key border-key/40" },
  IN_REVIEW: { label: "Ready for PBR", pillClass: "text-amberText border-amberBorder bg-amberBg" },
  PBR_DONE: { label: "Ready For Dev", pillClass: "text-good border-good/40" },
};
