import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Page not found" };

export default function NotFound() {
  return (
    <div className="mx-auto flex min-h-[70dvh] max-w-md flex-col items-center justify-center px-6 text-center">
      <p className="mono text-[13px] text-ink-3">404</p>
      <h1 className="mt-2 text-[26px] font-semibold tracking-[-0.025em]">This page dropped a stitch.</h1>
      <p className="mt-2 text-[14.5px] text-ink-2">The link may be old or mistyped. Shared proofs live on the Proof page.</p>
      <div className="mt-6 flex flex-wrap justify-center gap-2">
        <Link href="/proof" className="btn btn-primary">Proof a pattern</Link>
        <Link href="/" className="btn btn-secondary">Home</Link>
      </div>
    </div>
  );
}
