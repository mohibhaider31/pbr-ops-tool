"use client";

// Shown when a signed-in user belongs to no board.
//
// Board membership IS the access control, so having none is a legitimate state
// — not an error. Previously it produced 36 different "no board" API failures
// and an app that looked broken.
export default function NoProductAssigned({ name }: { name?: string | null }) {
  return (
    <div className="flex-1 flex items-center justify-center p-8">
      <div className="max-w-[460px] flex flex-col gap-4 text-center">
        <div className="flex items-center justify-center gap-[10px]">
          <span className="bg-accent text-white font-mono font-bold text-[12px] tracking-[.06em] px-[8px] py-[4px]">
            PBR
          </span>
          <span className="text-[15px] font-semibold tracking-[.02em]">Ops Tool</span>
        </div>

        <div className="border border-border bg-white px-7 py-8 flex flex-col gap-3">
          <span className="text-[17px] font-semibold">
            {name ? `You're signed in, ${name.split(" ")[0]}` : "You're signed in"}
          </span>
          <p className="m-0 text-[13px] text-muted leading-[1.6]">
            You don&apos;t have a product assigned yet, so there&apos;s nothing to show. An
            administrator needs to give you access to a board before you can see its backlog,
            pipeline or roadmap.
          </p>
          <p className="m-0 text-[12px] text-muted3 leading-[1.55]">
            Ask whoever set up your account to add you in <strong>Settings → Boards</strong>. Once
            they do, refresh and your product will appear here.
          </p>
        </div>

        <a href="/api/auth/logout" className="text-[12.5px] text-muted2 hover:text-key">
          Sign out
        </a>
      </div>
    </div>
  );
}
