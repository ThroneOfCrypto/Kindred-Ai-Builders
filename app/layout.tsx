import "./globals.css";
import Link from "next/link";

export const metadata = {
  title: "Kindred AI Builders (Offline-first)",
  description: "A beginner-friendly SDDE-inspired builder that exports deterministic spec packs."
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <nav>
          <Link className="btn" href="/">Home</Link>
          <Link className="btn" href="/builder">Builder</Link>
          <Link className="btn" href="/about">About</Link>
          <a className="btn" href="/api/ai/status">AI Status</a>
        </nav>
        <main>{children}</main>
      </body>
    </html>
  );
}
