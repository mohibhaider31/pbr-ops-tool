"use client";

import { useEffect, useState } from "react";
import { can as canDo, type Capability, type BoardRole } from "@/lib/permissions";

export type ViewerInfo = {
  name: string;
  email: string | null;
  avatarUrl: string | null;
  role: BoardRole;
  isAdmin: boolean;
};

// Client hook: fetches the current viewer once and exposes a `can()` checker
// for hiding controls. Returns { viewer, can, loading }.
export function useViewer() {
  const [viewer, setViewer] = useState<ViewerInfo | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/viewer")
      .then((r) => r.json())
      .then((d) => setViewer(d.viewer))
      .catch(() => setViewer(null))
      .finally(() => setLoading(false));
  }, []);

  const can = (cap: Capability) =>
    viewer ? canDo({ role: viewer.role, isAdmin: viewer.isAdmin }, cap) : false;

  return { viewer, can, loading };
}
