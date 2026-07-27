import { redirect } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import { getSession } from "@/lib/session";

// Authenticated app shell. Validates the session server-side: a missing OR
// invalid/expired cookie (present but no matching DB row) redirects to login.
// This is the real gate; middleware only does a fast presence check.
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect("/login");

  return (
    <div className="flex h-screen w-full overflow-hidden bg-paper text-ink font-sans">
      <Sidebar />
      <main className="flex-1 min-w-0 flex flex-col overflow-hidden">{children}</main>
    </div>
  );
}
