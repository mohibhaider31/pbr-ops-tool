"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

const NAV = [
  { label: "Dashboard", href: "/dashboard", soon: false, adminOnly: true },
  { label: "My Work", href: "/", soon: false },
  { label: "Backlog", href: "/backlog", soon: false },
  { label: "Pipeline", href: "/pipeline", soon: false },
  { label: "Poker", href: "/poker", soon: false },
  { label: "Settings", href: "/settings", soon: false },
];

function initialsOf(name: string) {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export default function Sidebar() {
  const pathname = usePathname();
  const [user, setUser] = useState<{ name: string; email: string | null; role?: string; isAdmin?: boolean; boardId?: string | null; boardName?: string | null } | null>(null);
  const [boards, setBoards] = useState<{ id: string; name: string; jiraProjectKey: string }[]>([]);
  const [boardMenuOpen, setBoardMenuOpen] = useState(false);
  const [switching, setSwitching] = useState(false);

  useEffect(() => {
    fetch("/api/viewer")
      .then((r) => r.json())
      .then((d) => { setUser(d.viewer); setBoards(d.boards || []); })
      .catch(() => setUser(null));
  }, []);

  const switchBoard = async (boardId: string) => {
    if (boardId === user?.boardId) { setBoardMenuOpen(false); return; }
    setSwitching(true);
    await fetch("/api/board/switch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ boardId }),
    });
    // Full reload so every board-scoped view refetches for the new board.
    window.location.href = "/";
  };

  const roleLabel = user?.isAdmin
    ? "Admin"
    : user?.role === "PO"
    ? "Product Owner"
    : user?.role === "BA"
    ? "Business Analyst"
    : user?.role === "DEVELOPER"
    ? "Developer"
    : user?.role === "VIEWER"
    ? "Viewer"
    : "";

  return (
    <aside className="w-[220px] flex-none bg-rail text-railText flex flex-col justify-between py-[18px]">
      <div className="flex flex-col gap-5">
        <div className="flex items-center gap-[9px] px-[18px]">
          <span className="bg-accent text-white font-mono font-bold text-[12px] tracking-[.06em] px-[7px] py-[4px]">
            PBR
          </span>
          <span className="text-[13px] font-semibold tracking-[.02em]">Ops Tool</span>
        </div>

        <div className="px-3 relative">
          <button
            onClick={() => boards.length > 1 && setBoardMenuOpen((v) => !v)}
            className={`w-full border border-railBorder bg-railRaised px-[11px] py-[10px] flex items-center gap-[9px] text-left ${boards.length > 1 ? "hover:border-railMuted2 cursor-pointer" : "cursor-default"}`}
          >
            <span className="flex flex-col gap-[3px] flex-1 min-w-0">
              <span className="font-mono text-[9.5px] tracking-[.09em] text-railMuted">BOARD</span>
              <span className="text-[12.5px] font-semibold text-railText overflow-hidden text-ellipsis whitespace-nowrap">
                {switching ? "Switching…" : user?.boardName || "—"}
              </span>
              <span className="font-mono text-[10px] text-railMuted2">
                Jira · {boards.find((b) => b.id === user?.boardId)?.jiraProjectKey || "—"}
              </span>
            </span>
            {boards.length > 1 && (
              <span className="font-mono text-[10px] text-railMuted2 flex-none">{boardMenuOpen ? "▴" : "▾"}</span>
            )}
          </button>

          {boardMenuOpen && boards.length > 1 && (
            <div className="absolute left-3 right-3 mt-1 z-20 border border-railBorder bg-rail shadow-xl">
              {boards.map((b) => (
                <button
                  key={b.id}
                  onClick={() => switchBoard(b.id)}
                  className={`w-full text-left px-[11px] py-[9px] flex flex-col gap-[2px] hover:bg-railRaised transition-colors ${b.id === user?.boardId ? "bg-railRaised" : ""}`}
                >
                  <span className="text-[12.5px] font-medium text-railText overflow-hidden text-ellipsis whitespace-nowrap">{b.name}</span>
                  <span className="font-mono text-[9.5px] text-railMuted2">Jira · {b.jiraProjectKey}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <nav className="flex flex-col gap-[2px]">
          {NAV.filter((item) => (!item.adminOnly && item.label !== "Settings") || user?.isAdmin).map((item) => {
            const active = item.href === pathname;
            return (
              <Link
                key={item.label}
                href={item.soon ? "#" : item.href}
                onClick={(e) => item.soon && e.preventDefault()}
                className={`relative flex items-center gap-2 px-[18px] py-[9px] text-[13px] font-medium tracking-[.01em] transition-colors ${
                  item.soon
                    ? "text-railMuted2 cursor-default"
                    : active
                    ? "text-railText"
                    : "text-railMuted hover:text-railText"
                }`}
              >
                {active && !item.soon && (
                  <span className="absolute left-0 top-1 bottom-1 w-[2px] bg-accent" />
                )}
                {item.label}
                {item.soon && (
                  <span className="ml-auto font-mono text-[8.5px] tracking-[.08em] text-railMuted3 border border-railBorder px-[5px] py-[1px]">
                    SOON
                  </span>
                )}
              </Link>
            );
          })}
        </nav>
      </div>

      <div className="flex flex-col gap-3 px-3">
        <div className="flex items-center gap-[9px] px-[6px] py-2 border-t border-railBorder">
          <span className="w-7 h-7 rounded-full bg-accent text-white font-mono text-[11px] font-semibold flex items-center justify-center flex-none">
            {user ? initialsOf(user.name) : "··"}
          </span>
          <span className="flex flex-col min-w-0 flex-1">
            <span className="text-[12px] font-medium text-railText overflow-hidden text-ellipsis whitespace-nowrap">
              {user ? user.name : "Signing in…"}
            </span>
            <span className="text-[10px] text-railMuted2 overflow-hidden text-ellipsis whitespace-nowrap">
              {roleLabel}
            </span>
          </span>
          <a
            href="/api/auth/logout"
            title="Sign out"
            className="text-railMuted2 hover:text-railText text-[14px] flex-none no-underline"
          >
            ⏻
          </a>
        </div>
      </div>
    </aside>
  );
}
