import type { Metadata, Viewport } from "next";
import "@fontsource-variable/inter";
import "@fontsource/instrument-serif/400.css";
import "@fontsource/instrument-serif/400-italic.css";
import "@fontsource-variable/jetbrains-mono";
import "./iso.css";
import "./globals.css";
import { TopBar } from "@/components/TopBar";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "https://stitchproof-alpha.vercel.app"),
  title: {
    default: "Stitchproof — every row, proven before you cast on",
    template: "%s · Stitchproof",
  },
  description:
    "Paste a knitting pattern. Stitchproof reads it, counts every stitch in every size, and shows exactly where the numbers don't add up — with the fix.",
  openGraph: {
    title: "Stitchproof",
    description: "A compiler for knitting patterns: every row, proven before you cast on.",
    type: "website",
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "Stitchproof finding three errata in a three-size beanie pattern" }],
  },
  twitter: { card: "summary_large_image", images: ["/og.png"] },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f7f5f0" },
    { media: "(prefers-color-scheme: dark)", color: "#12110f" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="antialiased">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-3 focus:z-50 focus:rounded-full focus:bg-surface focus:px-4 focus:py-2"
        >
          Skip to content
        </a>
        <TopBar />
        <main id="main">{children}</main>
      </body>
    </html>
  );
}
