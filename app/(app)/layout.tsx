import { redirect } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import { SyncProvider } from "@/components/SyncProvider";
import ServiceUnavailable from "@/components/ServiceUnavailable";
import { getSession } from "@/lib/session";

// Next signals redirect()/notFound() by throwing an error whose `digest`
// starts with these markers. We must re-throw those, and only treat OTHER
// exceptions (like a DB outage) as a service error.
function isControlFlowError(err: unknown): boolean {
  const digest = (err as { digest?: string })?.digest;
  return typeof digest === "string" && (digest.startsWith("NEXT_REDIRECT") || digest === "NEXT_NOT_FOUND");
}

// Authenticated app shell. Validates the session server-side: a missing OR
// invalid/expired cookie (present but no matching DB row) redirects to login.
// This is the real gate; middleware only does a fast presence check.
//
// If the database is unreachable (e.g. Postgres paused), we show a graceful
// "temporarily unavailable" screen instead of letting a raw server exception
// bubble up as an error page.
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  let session;
  try {
    session = await getSession();
  } catch (err) {
    if (isControlFlowError(err)) throw err; // never swallow redirect/notFound
    return <ServiceUnavailable />;
  }
  if (!session) redirect("/login");

  return (
    <SyncProvider>
      <div className="flex h-screen w-full overflow-hidden bg-paper text-ink font-sans">
        <Sidebar />
        <main className="flex-1 min-w-0 flex flex-col overflow-hidden">{children}</main>
      </div>
    </SyncProvider>
  );
}
