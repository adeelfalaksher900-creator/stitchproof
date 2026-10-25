import Link from "next/link";
import { CountingMachine } from "@/components/CountingMachine";
import { Alert, Arrow, Check, Lock } from "@/components/icons";
import { REPO_URL } from "@/components/TopBar";
import { SAMPLES } from "@/lib/samples";
import { findErrata } from "@/lib/stitch/errata";
import { evaluateFixer } from "@/lib/stitch/evaluate";
import { CLEAN_PATTERNS } from "@/lib/stitch/fixtures";
import { proofText } from "@/lib/stitch/proof";

/** A real result, computed from the sample pattern by the same engine the app uses. */
function demoErratum() {
  const text = SAMPLES.find((s) => s.id === "beanie")!.text;
  const proof = proofText(text);
  const { errata } = findErrata(text, proof);
  return errata.find((e) => e.sizeName === "Adult L") ?? errata[errata.length - 1];
}

export default function Home() {
  const e = demoErratum();
  return (
    <div className="overflow-x-clip">
      {/* ---------- Hero ---------- */}
      <section className="mx-auto grid max-w-[1200px] items-center gap-12 px-4 pt-14 pb-16 sm:px-6 lg:grid-cols-[1.05fr_1fr] lg:gap-16 lg:pt-24 lg:pb-24">
        <div className="min-w-0">
          <h1 className="serif text-[46px] leading-[0.98] text-ink sm:text-[68px] lg:text-[76px]">
            Every row, proven before you cast on.
          </h1>
          <p className="mt-6 max-w-[34rem] text-[17px] leading-relaxed text-ink-2 sm:text-[18px]">
            Paste a knitting pattern. Stitchproof reads it, counts every stitch in every size, and shows you exactly where the numbers don&apos;t add up, and how to fix them.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/proof?sample=beanie&run=1" className="btn btn-primary btn-lg">
              Try the flawed beanie <Arrow size={18} />
            </Link>
            <Link href="/proof" className="btn btn-secondary btn-lg">Proof your pattern</Link>
          </div>
          <p className="mt-5 flex items-center gap-2 text-[13px] text-ink-3">
            <Lock size={14} /> Free, no account. Standard patterns are read entirely in your browser.
          </p>
        </div>

        {/* A real erratum, rendered from the engine. */}
        {e && (
          <div className="relative min-w-0">
            <div aria-hidden className="absolute -inset-3 sm:-inset-6 -z-10 rounded-[32px] bg-paper-2" />
            <div className="card overflow-hidden shadow-[var(--shadow-2)]">
              <div className="flex items-center gap-2 border-b border-line px-5 py-3.5">
                <span className="pill bg-bad-soft text-bad"><Alert size={13} /> Doesn&apos;t add up</span>
                <span className="ml-auto text-[12px] text-ink-3">Harbour Beanie · sample</span>
              </div>
              <div className="px-5 pt-4 pb-4">
                <div className="flex items-center gap-2">
                  <h2 className="text-[16px] font-semibold tracking-[-0.01em]">{e.rowLabel}</h2>
                  <span className="pill bg-paper-2 text-ink-2">size {e.sizeName}</span>
                </div>
                <p className="mt-2 text-[14.5px] leading-relaxed">{e.messages[0]}</p>
                {e.knockOn > 0 && <p className="mt-1 text-[12.5px] text-ink-3">{e.knockOn} later rounds go wrong because of this one.</p>}
              </div>
              {e.fix && (
                <div className="border-t border-line bg-surface-2 px-5 py-4">
                  <p className="text-[12.5px] font-semibold text-ink-2">Suggested fix</p>
                  <p className="mt-1 text-[14.5px] font-medium">{e.fix.description}</p>
                  <div className="mono mt-3 overflow-hidden rounded-xl border border-line bg-surface text-[12px] leading-6">
                    <div className="truncate px-3 text-ink-3"><span className="mr-2 text-bad">−</span>{e.fix.lineBefore}</div>
                    <div className="truncate border-t border-line px-3 text-ink"><span className="mr-2 text-ok">+</span>{e.fix.lineAfter}</div>
                  </div>
                  <p className="mt-3 flex items-center gap-2 text-[12.5px] text-ok">
                    <Check size={14} strokeWidth={2.4} /> {e.fix.evidence}
                  </p>
                </div>
              )}
            </div>
          </div>
        )}
      </section>

      {/* ---------- How it works ---------- */}
      <section id="how" className="mx-auto max-w-[1200px] border-t border-line px-4 py-20 sm:px-6 lg:py-24">
        <div className="max-w-2xl">
          <h2 className=" text-[34px] leading-tight font-semibold tracking-[-0.03em] sm:text-[42px]">
            AI reads the words. Code counts the stitches.
          </h2>
          <p className="mt-4 text-[16.5px] leading-relaxed text-ink-2">
            Language models write pattern-shaped text without keeping a running total. That&apos;s why AI-generated patterns so often don&apos;t work. Stitchproof only trusts AI to translate. Every count is plain arithmetic you can check.
          </p>
        </div>
        <div className="mt-12 grid items-start gap-10 lg:grid-cols-[1.4fr_1fr] lg:gap-14">
          <div className="min-w-0">
            <CountingMachine />
          </div>
          <ol className="space-y-8">
            {[
              ["Read", "The offline reader understands standard notation. Only lines it can't read are sent to a small AI model, which rewrites them in strict notation, copying every number, never correcting it. The parser then checks that translation before anything is counted."],
              ["Count", "Every stitch is defined by how many stitches it uses and how many it makes: k2tog uses 2 and makes 1, a yarn-over uses none and makes 1. Each row is walked stitch by stitch, for every size, and compared with the count the pattern promises."],
              ["Fix", "When a row doesn't add up, Stitchproof tries small edits to that row's numbers, re-counts the whole pattern for each, and suggests the one that makes everything agree, or tells you the printed count is the typo."],
            ].map(([t, d], i) => (
              <li key={t} className="flex gap-4">
                <span className="mono grid h-8 w-8 shrink-0 place-items-center rounded-full border border-line-2 bg-surface text-[13px] font-semibold">{i + 1}</span>
                <div>
                  <h3 className="text-[17px] font-semibold tracking-[-0.015em]">{t}</h3>
                  <p className="mt-1.5 text-[15px] leading-relaxed text-ink-2">{d}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ---------- Accuracy, measured at build time ---------- */}
      <Accuracy />

      {/* ---------- Who it's for ---------- */}
      <section className="mx-auto grid max-w-[1200px] gap-8 px-4 py-20 sm:px-6 lg:grid-cols-[1fr_2fr] lg:gap-16 lg:py-24">
        <h2 className="text-[30px] leading-tight font-semibold tracking-[-0.03em] sm:text-[36px]">Who it&apos;s for</h2>
        <dl className="divide-y divide-line border-y border-line">
          {[
            ["Designers", "Check every size before you publish, and catch the errata your test knitters would have found on row 40. Send them a proof link instead of a spreadsheet."],
            ["Knitters", "Check a pattern before you buy yarn, then knit it one row at a time with the count to expect and each row in plain English."],
            ["Buyers", "A pattern whose numbers never add up is a common sign of a machine-written listing. Get evidence, not a hunch."],
          ].map(([t, d]) => (
            <div key={t} className="grid gap-1 py-5 sm:grid-cols-[9rem_1fr] sm:gap-6">
              <dt className="text-[16px] font-semibold tracking-[-0.01em]">{t}</dt>
              <dd className="text-[15px] leading-relaxed text-ink-2">{d}</dd>
            </div>
          ))}
        </dl>
      </section>

      {/* ---------- CTA ---------- */}
      <section className="mx-auto max-w-[1200px] px-4 py-24 text-center sm:px-6">
        <h2 className="serif text-[44px] leading-none sm:text-[56px]">Knit it once. Knit it right.</h2>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link href="/proof" className="btn btn-primary btn-lg">Proof a pattern <Arrow size={18} /></Link>
        </div>
      </section>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-[1200px] flex-wrap items-center gap-x-6 gap-y-2 px-4 py-8 text-[12.5px] text-ink-3 sm:px-6">
          <span>Stitchproof · built for Devpost&apos;s Build With AI: Basics</span>
          <span>Sample patterns are original and for demonstration.</span>
          <a href={REPO_URL} className="ml-auto hover:text-ink" target="_blank" rel="noreferrer">Source · MIT</a>
        </div>
      </footer>
    </div>
  );
}

/** Every number here is computed from the real engine when the site is built. */
function Accuracy() {
  const r = evaluateFixer(CLEAN_PATTERNS);
  const visible = r.total - r.invisible;
  const pct = (a: number, b: number) => `${Math.round((1000 * a) / b) / 10}%`;
  const stats: [string, string][] = [
    [String(r.total), `single-number typos, made in ${Object.keys(CLEAN_PATTERNS).length} correct patterns`],
    [pct(r.detected, visible), `of the ${visible} typos that change a stitch count were caught`],
    [pct(r.repaired, r.detected), "of those were repaired so every row adds up again"],
    [pct(r.restored, r.detected), "were restored to the designer's exact original text"],
  ];
  return (
    <section className="border-y border-line bg-surface">
      <div className="mx-auto max-w-[1200px] px-4 py-16 sm:px-6 lg:py-20">
        <div className="max-w-2xl">
          <h2 className=" text-[30px] leading-tight font-semibold tracking-[-0.03em] sm:text-[36px]">We broke correct patterns on purpose.</h2>
          <p className="mt-3 text-[15.5px] leading-relaxed text-ink-2">
            Every number in six correct patterns (cast-ons, repeat counts, stitch counts and stated totals, in every size) was changed by ±1 and ±2,
            the typos designers actually make. Then Stitchproof proofed and fixed each broken copy on its own.
          </p>
        </div>
        <dl className="mt-10 grid grid-cols-2 gap-x-4 gap-y-6 sm:gap-6 lg:grid-cols-4">
          {stats.map(([big, small]) => (
            <div key={small} className="border-t-2 border-ink pt-4">
              <dt className="text-[34px] font-semibold tracking-[-0.03em] tnum">{big}</dt>
              <dd className="mt-1 text-[14px] leading-snug text-ink-2">{small}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-8 text-[12.5px] text-ink-3">
          The other {r.invisible} typos change no stitch count (for example, how many plain rows to knit), so no count-based check can see them. Recomputed on
          every build by <span className="mono">lib/stitch/evaluate.ts</span>; run it yourself with <span className="mono">npx tsx scripts/eval-fixer.ts</span>.
        </p>
      </div>
    </section>
  );
}
