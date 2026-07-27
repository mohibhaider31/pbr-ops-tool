import "./globals.css";
import Sidebar from "@/components/Sidebar";

export const metadata = {
  title: "PBR Ops Tool",
  description: "Backlog prioritization and PBR review workflow",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="flex h-screen w-full overflow-hidden bg-paper text-ink font-sans">
          <Sidebar />
          <main className="flex-1 min-w-0 flex flex-col overflow-hidden">{children}</main>
        </div>
      </body>
    </html>
  );
}
