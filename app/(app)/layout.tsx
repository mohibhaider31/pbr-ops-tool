import Sidebar from "@/components/Sidebar";

// Authenticated app shell. The login page lives outside this group so it
// renders without the sidebar/nav.
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen w-full overflow-hidden bg-paper text-ink font-sans">
      <Sidebar />
      <main className="flex-1 min-w-0 flex flex-col overflow-hidden">{children}</main>
    </div>
  );
}
