"use client";

import { useRef } from "react";
import { STITCHES } from "@/lib/stitch/stitches";
import { Question } from "./icons";

const EXAMPLES: [string, string][] = [
  ["CO 80 (88, 96) sts.", "Cast on, one number per size"],
  ["Row 5 (RS): …   Rnd 3: …   Rows 3–12: …", "Rows, rounds and ranges"],
  ["Row 2 and all WS rows: Purl.", "A rule for every wrong-side row"],
  ["K2, *p2, k2; rep from * to end.", "Star repeats, also “to last 3 sts”, “4 more times”, “around”"],
  ["[K1, p1] 5 times.   (k1, p1) x 5", "Bracket repeats"],
  ["K to last st, m1r, k1.", "Whole and partial rows"],
  ["Rows 7–40: Rep rows 5–6.", "Repeating earlier rows"],
  ["(72 (81, 90) sts)   — 72 sts", "Stated stitch counts"],
  ["Sizes: S (M, L)", "Size names"],
];

/** A short reference for what the offline reader understands. */
export function NotationGuide({ label = "What can I paste?" }: { label?: string }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const codes = Object.keys(STITCHES).filter((c) => !c.includes("-"));
  return (
    <>
      <button
        type="button"
        onClick={() => dialog.current?.showModal()}
        className="inline-flex items-center gap-1 rounded-full text-[12px] font-medium text-accent hover:underline"
      >
        <Question size={13} /> {label}
      </button>
      <dialog
        ref={dialog}
        aria-labelledby="notation-title"
        className="m-auto w-[min(640px,calc(100vw-32px))] rounded-[20px] border border-line bg-surface p-0 text-ink shadow-[var(--shadow-2)] backdrop:bg-black/30 backdrop:backdrop-blur-sm"
        onClick={(e) => {
          if (e.target === dialog.current) dialog.current?.close();
        }}
      >
        <div className="max-h-[80dvh] overflow-y-auto p-6 sm:p-7">
          <div className="flex items-start gap-3">
            <div>
              <h2 id="notation-title" className="text-[19px] font-semibold tracking-[-0.02em]">
                What Stitchproof reads
              </h2>
              <p className="mt-1 text-[14px] text-ink-2">
                Standard written US knitting notation is read instantly in your browser. Anything else, like loose prose or unusual phrasing, goes to the AI
                reader in Auto mode, and lines it can&apos;t express are marked “not counted”, never guessed.
              </p>
            </div>
            <form method="dialog" className="ml-auto">
              <button className="btn btn-ghost btn-sm" aria-label="Close">
                ✕
              </button>
            </form>
          </div>
          <dl className="mt-5 divide-y divide-line rounded-2xl border border-line">
            {EXAMPLES.map(([code, meaning]) => (
              <div key={code} className="grid gap-1 px-4 py-2.5 sm:grid-cols-[1.25fr_1fr] sm:gap-4">
                <dt className="mono text-[12.5px] text-ink">{code}</dt>
                <dd className="text-[13px] text-ink-2">{meaning}</dd>
              </div>
            ))}
          </dl>
          <h3 className="mt-6 text-[14px] font-semibold">Stitches</h3>
          <p className="mono mt-2 text-[12.5px] leading-6 text-ink-2">{codes.join(" · ")}</p>
          <h3 className="mt-6 text-[14px] font-semibold">Marked “can’t verify” instead of guessed</h3>
          <p className="mt-1 text-[13.5px] text-ink-2">
            Short rows (w&amp;t), working “to marker”, and anything worked to a measurement (“until piece measures 6 in”). The count is carried forward and the
            rest of the pattern is still checked.
          </p>
        </div>
      </dialog>
    </>
  );
}
