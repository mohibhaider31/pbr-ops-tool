import "./globals.css";

export const metadata = {
  title: "PBR Ops Tool",
  description: "Backlog prioritization and PBR review workflow",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
