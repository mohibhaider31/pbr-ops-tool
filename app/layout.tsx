import "./globals.css";

export const metadata = {
  title: "PBR Ops — Backlog & Review",
  description: "Backlog prioritization and PBR review workflow",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen">
        <header className="border-b border-[#e1e4ec] bg-white">
          <div className="mx-auto max-w-6xl px-6 py-4 flex items-center gap-3">
            <div className="h-7 w-7 rounded-md bg-navy flex items-center justify-center">
              <span className="text-cyan text-xs font-bold">PB</span>
            </div>
            <span className="font-semibold tracking-tight text-[#12142b]">PBR Ops</span>
            <span className="text-sm text-[#8890a6]">Backlog & Review</span>
          </div>
        </header>
        <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
      </body>
    </html>
  );
}
