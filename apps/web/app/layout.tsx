import type { Metadata, Viewport } from "next";
import { IBM_Plex_Mono, IBM_Plex_Sans, Newsreader } from "next/font/google";
import type { ReactNode } from "react";
import "./globals.css";

// Three voices: the instruments (mono), the interface (sans) and anything a person says (serif).
const mono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-mono", display: "swap" });
const sans = IBM_Plex_Sans({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-sans", display: "swap" });
const serif = Newsreader({ subsets: ["latin"], weight: ["400"], style: ["normal", "italic"], variable: "--font-serif", display: "swap" });

export const metadata: Metadata = {
  title: "Last Stand Protocol",
  description: "Episode 1 — Descent. A three-phone cooperative dive.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#05080a",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${mono.variable} ${sans.variable} ${serif.variable}`}>
      <body>{children}</body>
    </html>
  );
}
