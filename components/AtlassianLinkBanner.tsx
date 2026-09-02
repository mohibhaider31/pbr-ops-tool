"use client";

import { useViewer } from "@/lib/useViewer";

// Shown to accounts that were invited but haven't linked an Atlassian identity.
//
// They can already use everything that lives in this tool — poker, reviews,
// comments, the roadmap. Linking is only needed for actions that write to Jira
// (PBR transitions, accepting estimates, mirroring comments), because those run
// under the person's own Atlassian token.
export default function AtlassianLinkBanner() {
  const { viewer } = useViewer();
  if (!viewer || viewer.authType !== "local") return null;

  return (
    <div className="flex items-center gap-3 px-[30px] py-[10px] bg-amberBg border-b border-amberBorder">
      <span className="text-[12.5px] text-amberTextDark leading-[1.5] flex-1">
        You&apos;re signed in without a linked Atlassian account. You can use the tool normally —
        connect Atlassian when you need to move stories through PBR or accept estimates.
      </span>
      <a
        href="/api/auth/login?link=1"
        className="flex-none h-[30px] px-3 inline-flex items-center gap-2 bg-ink text-white text-[12px] font-semibold no-underline hover:bg-[#2E2B25] transition-colors"
      >
        <span className="w-[14px] h-[14px] bg-accent inline-flex items-center justify-center text-white font-mono text-[8px] font-bold">
          A
        </span>
        Connect Atlassian
      </a>
    </div>
  );
}
