"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

const NAV = [
  { label: "Backlog", href: "/", soon: false },
  { label: "Pipeline", href: "/pipeline", soon: false },
  { label: "Poker", href: "#", soon: true },
  { label: "Settings", href: "#", soon: true },
];

function initialsOf(name: string) {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export default function Sidebar() {
  const pathname = usePathname();
  const [user, setUser] = useState<{ name: string; email: string | null } | null>(null);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((d) => setUser(d.user))
      .catch(() => setUser(null));
  }, []);

  return (
    <aside className="w-[220px] flex-none bg-rail text-railText flex flex-col justify-between py-[18px]">
      <div className="flex flex-col gap-5">
        <div className="flex items-center gap-[9px] px-[18px]">
          <span className="bg-accent text-white font-mono font-bold text-[12px] tracking-[.06em] px-[7px] py-[4px]">
            PBR
          </span>
          <span className="text-[13px] font-semibold tracking-[.02em]">Ops Tool</span>
        </div>

        <div className="px-3">
          <div className="w-full border border-railBorder bg-railRaised px-[11px] py-[10px] flex items-center gap-[9px]">
            <span className="flex flex-col gap-[3px] flex-1 min-w-0">
              <span className="font-mono text-[9.5px] tracking-[.09em] text-railMuted">BOARD</span>
              <span className="text-[12.5px] font-semibold text-railText overflow-hidden text-ellipsis whitespace-nowrap">
                RAE Risk Engine
              </span>
              <span className="font-mono text-[10px] text-railMuted2">Jira · RAE</span>
            </span>
          </div>
        </div>

        <nav className="flex flex-col gap-[2px]">
          {NAV.map((item) => {
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
              {user?.email || ""}
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
