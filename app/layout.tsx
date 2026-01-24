import "./globals.css";

import { TokenTheme } from "../components/TokenTheme";
import { TopNav } from "../components/TopNav";
import { Footer } from "../components/Footer";

export const metadata = {
  title: "Kindred AI Builders",
  description: "Director-first iteration with deterministic SDDE artefacts.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <TokenTheme />
        <div className="container">
          <TopNav />
        </div>
        {children}
        <div className="container">
          <Footer />
        </div>
      </body>
    </html>
  );
}
