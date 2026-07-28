export const metadata = { title: "Terms of Service · PBR Ops Tool" };

export default function TermsPage() {
  return (
    <div className="min-h-screen w-full bg-paper text-ink font-sans flex justify-center py-16 px-6">
      <div className="w-full max-w-[720px] flex flex-col gap-6">
        <div className="flex items-center gap-[10px]">
          <span className="bg-accent text-white font-mono font-bold text-[13px] tracking-[.06em] px-[9px] py-[5px]">PBR</span>
          <span className="text-[16px] font-semibold tracking-[.02em]">Ops Tool</span>
        </div>

        <h1 className="m-0 text-[28px] font-semibold tracking-[-0.02em]">Terms of Service</h1>
        <p className="m-0 text-[13px] text-muted2">Last updated: {new Date().toLocaleDateString("en-GB", { year: "numeric", month: "long", day: "numeric" })}</p>

        <div className="flex flex-col gap-5 text-[14px] leading-[1.65] text-ink/90">
          <p className="m-0">
            PBR Ops Tool (&quot;the App&quot;) is an internal tool provided by Logiciel Services to its team members to
            support product-operations work alongside Atlassian Jira. By using the App you agree to these terms.
          </p>

          <section className="flex flex-col gap-2">
            <h2 className="m-0 text-[17px] font-semibold">Permitted use</h2>
            <p className="m-0">
              The App is for authorized team members carrying out their normal work. You agree to use it only for its
              intended purpose and in line with your organization&apos;s policies and your Jira access permissions.
            </p>
          </section>

          <section className="flex flex-col gap-2">
            <h2 className="m-0 text-[17px] font-semibold">Data and actions</h2>
            <p className="m-0">
              Actions you take in the App — such as comments, status transitions, and estimates — may be written to Jira
              under your account. You are responsible for the actions you take through the App.
            </p>
          </section>

          <section className="flex flex-col gap-2">
            <h2 className="m-0 text-[17px] font-semibold">Availability</h2>
            <p className="m-0">
              The App is provided on an &quot;as is&quot; basis for internal use. It may change, be interrupted, or be
              discontinued at any time. No warranty or guaranteed availability is implied.
            </p>
          </section>

          <section className="flex flex-col gap-2">
            <h2 className="m-0 text-[17px] font-semibold">Limitation of liability</h2>
            <p className="m-0">
              To the extent permitted by law, Logiciel Services is not liable for any loss arising from use of the App.
              The App supplements, and does not replace, Jira as the system of record.
            </p>
          </section>

          <section className="flex flex-col gap-2">
            <h2 className="m-0 text-[17px] font-semibold">Contact</h2>
            <p className="m-0">
              For questions about these terms, contact the Logiciel Services team that operates the App.
            </p>
          </section>
        </div>

        <a href="/login" className="text-[13px] text-key no-underline mt-2">← Back to sign in</a>
      </div>
    </div>
  );
}
