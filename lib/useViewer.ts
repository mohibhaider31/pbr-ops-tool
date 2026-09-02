"use client";

import { useEffect, useState } from "react";
import { can as canDo, type Capability, type BoardRole } from "@/lib/permissions";

export type ViewerInfo = {
  authType?: string; // "atlassian" | "local" (invited, not yet linked)
  name: string;
  email: string | null;
  avatarUrl: string | null;
  role: BoardRole | null;
  isAdmin: boolean;
};

// Module-level cache + in-flight promise so every component that calls
// useViewer() shares ONE fetch instead of each re-fetching /api/viewer.
// This matters because the StoryDrawer (and others) mount often; without
// this, opening each story re-fetched the viewer and briefly hid
// permission-gated controls (like the assign button) while it loaded.
let _cached: ViewerInfo | null = null;
let _inflight: Promise<ViewerInfo | null> | null = null;

async function loadViewer(): Promise<ViewerInfo | null> {
  if (_cached) return _cached;
  if (_inflight) return _inflight;
  _inflight = fetch("/api/viewer")
    .then((r) => r.json())
    .then((d) => { _cached = d.viewer; return d.viewer as ViewerInfo | null; })
    .catch(() => null)
    .finally(() => { _inflight = null; });
  return _inflight;
}

// Allow a manual refresh (e.g. after switching boards) to bust the cache.
export function refreshViewer() { _cached = null; }

export function useViewer() {
  const [viewer, setViewer] = useState<ViewerInfo | null>(_cached);
  const [loading, setLoading] = useState(!_cached);

  useEffect(() => {
    let alive = true;
    if (_cached) { setViewer(_cached); setLoading(false); return; }
    loadViewer().then((v) => { if (alive) { setViewer(v); setLoading(false); } });
    return () => { alive = false; };
  }, []);

  // Once we know the viewer, admins and PO/BA get their caps; while still
  // loading we optimistically DON'T hide (return true) only if we have a
  // cached viewer — otherwise false. But to avoid controls flickering away,
  // treat "still loading with no data" as loading, handled by callers.
  const can = (cap: Capability) =>
    viewer ? canDo({ role: viewer.role ?? "VIEWER", isAdmin: viewer.isAdmin, authType: viewer.authType }, cap) : false;

  return { viewer, can, loading };
}
