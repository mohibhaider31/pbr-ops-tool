"use client";

// Shown when the database is unreachable (e.g. the Postgres instance is paused
// or briefly down) instead of a raw server crash. Purely presentational.
export default function ServiceUnavailable() {
  return (
    <div className="min-h-screen w-full bg-paper text-ink font-sans flex items-center justify-center p-6">
      <div className="w-full max-w-[440px] flex flex-col gap-4 text-center">
        <div className="flex items-center justify-center gap-[10px]">
          <span className="bg-accent text-white font-mono font-bold text-[13px] tracking-[.06em] px-[9px] py-[5px]">PBR</span>
          <span className="text-[16px] font-semibold tracking-[.02em]">Ops Tool</span>
        </div>
        <div className="border border-amberBorder bg-amberBg px-6 py-6 flex flex-col gap-3">
          <span className="text-[16px] font-semibold text-amberTextDark">Temporarily unavailable</span>
          <p className="m-0 text-[13px] text-amberTextDark leading-[1.6]">
            The tool can&apos;t reach its database right now. This usually clears on its own within a minute or two. Please wait a moment and reload.
          </p>
        </div>
        <button
          onClick={() => location.reload()}
          className="h-[40px] bg-ink text-white text-[13px] font-semibold self-center px-6"
        >
          Reload
        </button>
        <p className="m-0 text-[11px] text-muted3">If this persists, the database may need to be resumed.</p>
      </div>
    </div>
  );
}
