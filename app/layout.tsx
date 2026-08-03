import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "CallCraft",
  description: "Applied AI reference implementation for grounded transcript follow-ups",
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
              <Link href="/evals">Evals</Link>
              <Link href="/settings">Settings</Link>
              <Link
                href="https://github.com/mherzog4/callcraft/tree/main/docs"
                target="_blank"
                rel="noreferrer"
              >
                Docs ↗
              </Link>
            </nav>
          </header>
          {children}
          <footer>
            MIT-licensed reference implementation · Synthetic Gong evaluation available · Email is
            never sent without confirmation
          </footer>
        </div>
      </body>
    </html>
  );
}
