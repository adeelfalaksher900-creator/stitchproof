"use client";

import Link from "next/link";

// Shown if a page crashes; the pattern text in the editor is kept in this browser.
export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="mx-auto flex min-h-[70dvh] max-w-md flex-col items-center justify-center px-6 text-center" role="alert">
      <h1 className="text-[26px] font-semibold tracking-[-0.025em]">Something went wrong.</h1>
      <p className="mt-2 text-[14.5px] text-ink-2">Your saved patterns are still in this browser. Try again, or start from the Proof page.</p>
      <div className="mt-6 flex flex-wrap justify-center gap-2">
        <button type="button" onClick={reset} className="btn btn-primary">Try again</button>
        <Link href="/proof" className="btn btn-secondary">Proof page</Link>
      </div>
    </div>
  );
}
