import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "CallCraft",
  description: "Grounded Gong follow-ups delivered and sent from Slack",
};
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <div className="shell">
          <header>
            <Link href="/" className="brand">
              <span className="logo">C</span>CallCraft
            </Link>
            <nav>
              <Link href="/">Calls</Link>
              <Link href="/drafts">Drafts</Link>
              <Link href="/settings">Settings</Link>
              <a href="https://github.com" target="_blank" rel="noreferrer">
                Docs ↗
              </a>
            </nav>
          </header>
          {children}
          <footer>Open-source · Privacy-first · Email is never sent without confirmation</footer>
        </div>
      </body>
    </html>
  );
}
