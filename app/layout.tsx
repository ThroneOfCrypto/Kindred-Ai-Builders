import "./globals.css";
import Link from "next/link";

export const metadata = {
  title: "Kindred v2",
  description: "Greenfield builder-first experience",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="container">
          <nav className="nav">
            <Link href="/">Home</Link>
            <Link href="/builder">Builder</Link>
            <Link href="/about">About</Link>
          </nav>
          {children}
        </div>
      </body>
    </html>
  );
}
