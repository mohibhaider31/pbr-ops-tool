export const metadata = { title: "Privacy Policy · PBR Ops Tool" };

export default function PrivacyPage() {
  return (
    <div className="min-h-screen w-full bg-paper text-ink font-sans flex justify-center py-16 px-6">
      <div className="w-full max-w-[720px] flex flex-col gap-6">
        <div className="flex items-center gap-[10px]">
          <span className="bg-accent text-white font-mono font-bold text-[13px] tracking-[.06em] px-[9px] py-[5px]">PBR</span>
          <span className="text-[16px] font-semibold tracking-[.02em]">Ops Tool</span>
        </div>

        <h1 className="m-0 text-[28px] font-semibold tracking-[-0.02em]">Privacy Policy</h1>
        <p className="m-0 text-[13px] text-muted2">Last updated: {new Date().toLocaleDateString("en-GB", { year: "numeric", month: "long", day: "numeric" })}</p>

        <div className="flex flex-col gap-5 text-[14px] leading-[1.65] text-ink/90">
          <p className="m-0">
            PBR Ops Tool (&quot;the App&quot;) is an internal product-operations tool operated by Logiciel Services for its
            own team. It integrates with Atlassian Jira to support backlog refinement, review workflows, delivery
            tracking, and estimation. This policy explains what the App accesses and how that information is used.
          </p>

          <section className="flex flex-col gap-2">
            <h2 className="m-0 text-[17px] font-semibold">Information we access</h2>
            <p className="m-0">When you sign in with your Atlassian account, the App accesses:</p>
            <ul className="m-0 pl-5 flex flex-col gap-1">
              <li>Your Atlassian profile — name, email address, account ID, and avatar — to identify you within the App.</li>
              <li>Jira project and issue data you already have permission to see, in order to display and update stories, comments, and estimates.</li>
              <li>Your OAuth access and refresh tokens, used solely to make requests to Jira on your behalf.</li>
            </ul>
          </section>

          <section className="flex flex-col gap-2">
            <h2 className="m-0 text-[17px] font-semibold">How we use it</h2>
            <p className="m-0">
              Information is used only to provide the App&apos;s features: showing your assigned work, mirroring comments
              and status changes to Jira, tracking delivery across teams, and recording planning-poker estimates. The
              App does not sell, rent, or share your information with third parties, and does not use it for advertising.
            </p>
          </section>

          <section className="flex flex-col gap-2">
            <h2 className="m-0 text-[17px] font-semibold">How it is stored</h2>
            <p className="m-0">
              The App stores operational data (review assignments, comments, delivery status, roles, and poker sessions)
              and your session tokens in a private database. Access tokens are held server-side and are not exposed to
              your browser. Data is retained for as long as the App is in use by your team and can be deleted on request.
            </p>
          </section>

          <section className="flex flex-col gap-2">
            <h2 className="m-0 text-[17px] font-semibold">Third-party services</h2>
            <p className="m-0">
              The App relies on Atlassian (Jira) for source data and authentication, and on infrastructure providers for
              hosting, database, and real-time messaging. These providers process data only to deliver the App&apos;s
              functionality.
            </p>
          </section>

          <section className="flex flex-col gap-2">
            <h2 className="m-0 text-[17px] font-semibold">Revoking access</h2>
            <p className="m-0">
              You can revoke the App&apos;s access at any time from your Atlassian account settings, under connected apps.
              Signing out of the App ends your session and clears your stored tokens.
            </p>
          </section>

          <section className="flex flex-col gap-2">
            <h2 className="m-0 text-[17px] font-semibold">Contact</h2>
            <p className="m-0">
              For questions about this policy or your data, contact the Logiciel Services team that operates the App.
            </p>
          </section>
        </div>

        <a href="/login" className="text-[13px] text-key no-underline mt-2">← Back to sign in</a>
      </div>
    </div>
  );
}
