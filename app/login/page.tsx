import LocalLoginForm from "@/components/LocalLoginForm";

export default function LoginPage({
  searchParams,
}: {
  searchParams: { error?: string };
}) {
  const error = searchParams?.error;
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-paper text-ink font-sans">
      <div className="w-[400px] flex flex-col items-center gap-8">
        <div className="flex items-center gap-[10px]">
          <span className="bg-accent text-white font-mono font-bold text-[14px] tracking-[.06em] px-[9px] py-[5px]">
            PBR
          </span>
          <span className="text-[17px] font-semibold tracking-[.02em]">Ops Tool</span>
        </div>

        <div className="w-full bg-white border border-border p-8 flex flex-col gap-5">
          <div className="flex flex-col gap-2">
            <h1 className="m-0 text-[20px] font-semibold tracking-[-0.02em]">Sign in</h1>
            <p className="m-0 text-[13px] text-muted leading-[1.55]">
              Use your Atlassian account. Your Jira identity is your identity here — you&apos;ll only see and act on
              the stories your Jira permissions already allow.
            </p>
          </div>

          {error === "not_invited" ? (
            <div className="border border-amberBorder bg-amberBg px-3 py-2 text-[12.5px] text-amberTextDark leading-[1.55]">
              Your Atlassian account isn&apos;t on the invite list yet. This tool is invite-only —
              ask an admin to add you, then sign in again.
            </div>
          ) : error && (
            <div className="border border-amberBorder bg-amberBg px-3 py-2 text-[12.5px] text-amberTextDark">
              Sign-in failed: {error}. Please try again.
            </div>
          )}

          <a
            href="/api/auth/login"
            className="h-[44px] flex items-center justify-center gap-[10px] bg-ink text-white text-[14px] font-semibold hover:bg-[#2E2B25] transition-colors no-underline"
          >
            <span className="w-[18px] h-[18px] bg-accent inline-flex items-center justify-center text-white font-mono text-[9px] font-bold">
              A
            </span>
            Continue with Atlassian
          </a>

          <div className="flex flex-col items-center">
            <LocalLoginForm />
          </div>
        </div>

        <p className="m-0 text-[11.5px] text-muted3 text-center leading-[1.6]">
          You&apos;ll be redirected to Atlassian to authorize access, then brought back here.
        </p>
      </div>
    </div>
  );
}
