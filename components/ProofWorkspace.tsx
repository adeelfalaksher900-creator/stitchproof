"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MAX_CHARS, readPattern, type ReaderMode, type Reading } from "@/lib/read";
import { SAMPLES } from "@/lib/samples";
import { findErrata, type Erratum } from "@/lib/stitch/errata";
import { findFixes } from "@/lib/stitch/fixes";
import { proofProgram, type Proof } from "@/lib/stitch/proof";
import { readShared, shareUrl } from "@/lib/share";
import { proofReport } from "@/lib/report";
import { load, newId, save, titleOf } from "@/lib/store";
import { Alert, Arrow, Check, Doc, Link2, Lock, Needles, Question, Wand } from "./icons";
import { NotationGuide } from "./NotationGuide";
import { AiKey } from "./AiKey";
import { PatternEditor, type EditorHandle, type LineMark } from "./PatternEditor";
import { RowList } from "./RowList";
import { ShapePreview } from "./ShapePreview";

type Stage = "idle" | "offline" | "ai" | "counting" | "done";

export function ProofWorkspace() {
  const params = useSearchParams();
  const router = useRouter();
  const editor = useRef<EditorHandle>(null);
  const [text, setText] = useState("");
  const [mode, setMode] = useState<ReaderMode>("auto");
  const [stage, setStage] = useState<Stage>("idle");
  const [reading, setReading] = useState<Reading | null>(null);
  const [proof, setProof] = useState<Proof | null>(null);
  const [proofedText, setProofedText] = useState<string>("");
  const [sizeIndex, setSizeIndex] = useState(0);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [errata, setErrata] = useState<{ list: Erratum[]; fixedText: string | null } | null>(null);
  const [patternId, setPatternId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState<number | null>(null);
  const abort = useRef<AbortController | null>(null);
  const started = useRef(false);

  const busy = stage === "offline" || stage === "ai" || stage === "counting";
  const stale = proof !== null && text !== proofedText && !busy;

  const run = useCallback(
    async (input: string, opts: { id?: string | null; keepSize?: boolean; readerMode?: ReaderMode } = {}) => {
      const t = input.trim();
      setError(null);
      if (!t) {
        setError("Paste a pattern first, or pick a sample.");
        return;
      }
      if (input.length > MAX_CHARS) {
        setError(`Patterns are limited to ${MAX_CHARS.toLocaleString()} characters, and this one has ${input.length.toLocaleString()}.`);
        return;
      }
      abort.current?.abort();
      const ctrl = new AbortController();
      abort.current = ctrl;
      const t0 = performance.now();
      try {
        const r = await readPattern(input, opts.readerMode ?? mode, (s) => setStage(s), ctrl.signal);
        if (ctrl.signal.aborted) return;
        setStage("counting");
        await new Promise((res) => setTimeout(res, 0));
        const p = proofProgram(r.program);
        setReading(r);
        setProof(p);
        setProofedText(input);
        setErrata(null);
        setSelectedKey(null);
        setElapsed(performance.now() - t0);
        if (!opts.keepSize || sizeIndex >= p.program.sizes.length) {
          const firstBad = p.sizes.findIndex((s) => s.issues > 0);
          setSizeIndex(firstBad >= 0 ? firstBad : 0);
        }
        setStage("done");
        if (p.verdict !== "empty") {
          const id = opts.id ?? patternId ?? newId();
          const existing = load(id);
          save({
            id,
            title: p.program.title ?? titleOf(input),
            text: input,
            reading: r.readBy === "ai" ? r.readingText : undefined,
            readBy: r.readBy === "ai" ? r.model : "offline",
            sizes: p.program.sizes,
            verdict: p.verdict,
            sizeIndex: existing?.sizeIndex ?? 0,
            row: existing?.row ?? 0,
            updatedAt: Date.now(),
          });
          setPatternId(id);
          router.replace(`/proof?id=${id}`, { scroll: false });
        }
      } catch (e) {
        if ((e as Error)?.name === "AbortError") return;
        setStage("idle");
        setError("Something went wrong while proofing. Please try again.");
      }
    },
    [mode, patternId, router, sizeIndex],
  );

  // Load a sample or a saved pattern from the URL once.
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const sample = params.get("sample");
    const id = params.get("id");
    if (window.location.hash.startsWith("#p=")) {
      void readShared(window.location.hash).then((shared) => {
        if (!shared) {
          setError("This share link is damaged, so the pattern couldn't be opened.");
          return;
        }
        setText(shared);
        setNotice("Opened a shared pattern. It came inside the link, nothing was downloaded from a server, and it's now saved in this browser.");
        void run(shared, { id: newId() });
      });
    } else if (sample) {
      const s = SAMPLES.find((x) => x.id === sample);
      if (s) {
        setText(s.text);
        if (params.get("run") === "1") void run(s.text, { id: newId() });
      }
    } else if (id) {
      const saved = load(id);
      if (saved) {
        setText(saved.text);
        setPatternId(saved.id);
        void run(saved.text, { id: saved.id });
      }
    }
  }, [params, run]);

  // Root errata are computed after the proof paints.
  useEffect(() => {
    if (!proof || !reading || proof.verdict !== "issues") {
      setErrata(proof ? { list: [], fixedText: null } : null);
      return;
    }
    const done = ({ errata: list, fixedText }: ReturnType<typeof findErrata>) => setErrata({ list, fixedText });
    const inline = () => done(findErrata(reading.readingText, proof));
    let worker: Worker;
    try {
      worker = new Worker(new URL("../lib/stitch/errata.worker.ts", import.meta.url));
    } catch {
      const handle = setTimeout(inline, 30);
      return () => clearTimeout(handle);
    }
    worker.onmessage = (e) => done(e.data);
    worker.onerror = inline;
    worker.postMessage({ text: reading.readingText, proof });
    return () => worker.terminate();
  }, [proof, reading]);

  const marks = useMemo(() => {
    const m = new Map<number, LineMark>();
    if (!proof || !reading || reading.readBy !== "offline" || stale) return m;
    proof.program.rows.forEach((row, i) => {
      const bad = proof.sizes.some((s) => s.rows[i]?.status === "issue");
      const cur = m.get(row.line);
      if (bad) m.set(row.line, "issue");
      else if (!cur) m.set(row.line, "ok");
    });
    proof.program.unread.forEach((u) => m.set(u.line, "unread"));
    return m;
  }, [proof, reading, stale]);

  const applyText = (next: string, message: string) => {
    setText(next);
    setNotice(message);
    void run(next, { keepSize: true, readerMode: "auto" });
  };

  const applyFix = (e: Erratum) => {
    if (!reading || !proof) return;
    // Recompute against the current reading so the edit is exact.
    const fix = findFixes(reading.readingText, proof.program, e.rowKey, e.size, 1)[0] ?? e.fix;
    if (!fix) return;
    const fromAi = reading.readBy === "ai";
    applyText(
      fix.newText,
      fromAi
        ? `Applied: ${fix.description} The editor now shows Stitchproof's notation of your pattern.`
        : `Applied: ${fix.description}`,
    );
  };

  const applyAll = () => {
    if (!errata?.fixedText || !reading) return;
    const n = errata.list.filter((e) => e.fix).length;
    applyText(
      errata.fixedText,
      `Applied ${n} fix${n === 1 ? "" : "es"}.${reading.readBy === "ai" ? " The editor now shows Stitchproof's notation of your pattern." : ""}`,
    );
  };

  const loadSample = (id: string) => {
    const s = SAMPLES.find((x) => x.id === id);
    if (!s) return;
    setText(s.text);
    setPatternId(null);
    setNotice(null);
    setProof(null);
    setReading(null);
    setStage("idle");
    void run(s.text, { id: newId() });
  };

  const size = proof?.sizes[sizeIndex];

  return (
    <div className="mx-auto max-w-[1280px] px-4 pt-6 pb-16 sm:px-6 lg:pt-8">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        {/* ---------- Editor ---------- */}
        <section aria-label="Pattern" className="lg:sticky lg:top-20 lg:self-start">
          <div className="card flex h-[460px] flex-col overflow-hidden lg:h-[calc(100dvh-7.5rem)]">
            <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3">
              <h1 className="text-[15px] font-semibold tracking-[-0.01em]">Pattern</h1>
              <span className="mr-auto flex items-center gap-3">
                <NotationGuide />
                <AiKey />
              </span>
              <div className="segmented" role="group" aria-label="Reader">
                <button type="button" aria-pressed={mode === "auto"} onClick={() => setMode("auto")} title="Offline reader first; AI only for lines it can't read">
                  Auto
                </button>
                <button type="button" aria-pressed={mode === "offline"} onClick={() => setMode("offline")} title="Never send the pattern anywhere">
                  <span className="inline-flex items-center gap-1"><Lock size={12} />Offline</span>
                </button>
              </div>
            </div>
            <div className="flex items-center gap-2 overflow-x-auto border-b border-line px-4 py-2.5 [scrollbar-width:none]">
              <span className="shrink-0 text-[12px] font-medium text-ink-3">Samples</span>
              {SAMPLES.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => loadSample(s.id)}
                  className="shrink-0 rounded-full border border-line bg-surface-2 px-3 py-1 text-[12px] font-medium text-ink-2 transition-colors hover:border-line-2 hover:text-ink"
                  title={s.blurb}
                >
                  {s.name}
                </button>
              ))}
            </div>
            <PatternEditor
              ref={editor}
              value={text}
              onChange={(v) => {
                setText(v);
                setNotice(null);
              }}
              onSubmit={() => void run(text)}
              marks={marks}
              placeholder={"Paste a knitting pattern…\n\nCO 44 sts.\nRows 1–4: Knit.\nRow 5 (RS): K3, *p2, k2; rep from * to last 5 sts, p2, k3."}
            />
            <div className="flex items-center gap-3 border-t border-line px-4 py-3">
              <span className={`text-[12px] tnum ${text.length > MAX_CHARS ? "text-bad" : "text-ink-3"}`}>
                {text.length.toLocaleString()} / {MAX_CHARS.toLocaleString()}
              </span>
              {stale && <span className="text-[12px] text-warn">Edited since last proof</span>}
              <button
                type="button"
                className="btn btn-primary ml-auto"
                disabled={busy || !text.trim()}
                onClick={() => void run(text)}
              >
                {busy ? <Spinner /> : <Check size={16} strokeWidth={2.2} />}
                {busy ? "Proofing…" : "Proof pattern"}
                <span className="kbd ml-1 hidden border-white/25 bg-white/10 text-white/80 sm:inline">⌘↵</span>
              </button>
            </div>
          </div>
        </section>

        {/* ---------- Results ---------- */}
        <section aria-label="Proof" aria-live="polite" className="min-w-0 space-y-4">
          {error && (
            <div role="alert" className="card flex items-start gap-3 border-bad/30 bg-bad-soft px-5 py-4 text-[14px] text-bad">
              <Alert size={18} className="mt-0.5 shrink-0" />
              {error}
            </div>
          )}
          {notice && (
            <div className="card rise flex items-start gap-3 px-5 py-3.5 text-[13.5px] text-ink-2">
              <Wand size={16} className="mt-0.5 shrink-0 text-accent" />
              {notice}
            </div>
          )}

          {busy && <Stages stage={stage} />}

          {!busy && !proof && <EmptyState onSample={loadSample} />}

          {!busy && proof && size && reading && (
            <>
              <Summary
                proof={proof}
                reading={reading}
                sizeIndex={sizeIndex}
                setSizeIndex={setSizeIndex}
                elapsed={elapsed}
                errata={errata}
                onApplyAll={applyAll}
                onShare={async () => {
                  try {
                    const url = await shareUrl(reading.readBy === "ai" ? reading.readingText : proofedText);
                    await navigator.clipboard.writeText(url);
                    setNotice("Share link copied. The pattern travels inside the link itself, so nothing is uploaded. Anyone who opens it sees this proof.");
                  } catch {
                    setError("Couldn't copy the link. Your browser may block clipboard access on this page.");
                  }
                }}
                onReport={async () => {
                  try {
                    const link = await shareUrl(reading.readBy === "ai" ? reading.readingText : proofedText);
                    const rows = proof.program.rows;
                    await navigator.clipboard.writeText(
                      proofReport({
                        title: proof.program.title ?? titleOf(proofedText),
                        counted: rows.filter((r) => r.number !== null).length,
                        rowsWord: rows.some((r) => r.round) ? "rounds" : "rows",
                        sizes: proof.program.sizes,
                        errata: errata?.list ?? [],
                        link,
                      }),
                    );
                    setNotice("Report copied. Paste it into a message to the seller, a marketplace report or your test knitters. It links to this proof.");
                  } catch {
                    setError("Couldn't copy the report. Your browser may block clipboard access on this page.");
                  }
                }}
                patternId={patternId}
                onSelect={setSelectedKey}
                selectedKey={selectedKey}
              />

              {reading.aiNote && (
                <div className="card flex items-start gap-3 border-warn/30 bg-warn-soft px-5 py-3.5 text-[13.5px] text-warn">
                  <Alert size={16} className="mt-0.5 shrink-0" />
                  <span className="min-w-0 flex-1">{reading.aiNote}</span>
                  {mode === "auto" && <AiKey label="Use my key" />}
                </div>
              )}

              {proof.verdict === "issues" && (
                <ErrataList
                  errata={errata}
                  sizes={proof.program.sizes}
                  onApply={applyFix}
                  onShow={(e) => {
                    setSizeIndex(e.size);
                    setSelectedKey(e.rowKey);
                    if (reading.readBy === "offline") editor.current?.focusLine(e.line);
                  }}
                />
              )}

              {proof.program.unread.length > 0 && <UnreadList reading={reading} />}

              {proof.verdict !== "empty" && (
                <div className="card overflow-hidden">
                  <div className="flex flex-wrap items-center gap-3 border-b border-line px-5 py-3.5">
                    <h2 className="text-[15px] font-semibold tracking-[-0.01em]">Row by row</h2>
                    <span className="text-[12.5px] text-ink-3">size {size.size}</span>
                    <span className="ml-auto text-[12px] text-ink-3">Tap a row for plain English</span>
                  </div>
                  <RowList
                    program={proof.program}
                    result={size}
                    sizeIndex={sizeIndex}
                    selectedKey={selectedKey}
                    onSelect={setSelectedKey}
                  />
                </div>
              )}

              {reading.readBy === "ai" && <ReadingDisclosure reading={reading} />}
            </>
          )}
        </section>
      </div>
    </div>
  );
}

function Spinner() {
  return (
    <svg className="spin" width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity=".3" strokeWidth="2.5" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}

function Stages({ stage }: { stage: Stage }) {
  const steps: { id: Stage; label: string; detail: string }[] = [
    { id: "offline", label: "Reading", detail: "The offline reader parses standard notation" },
    { id: "ai", label: "AI translation", detail: "Only for lines the offline reader couldn't read, then checked by the parser" },
    { id: "counting", label: "Counting rows", detail: "Every row, every size, by plain arithmetic" },
  ];
  const order: Stage[] = ["offline", "ai", "counting"];
  const at = order.indexOf(stage);
  return (
    <div className="card px-6 py-6" role="status">
      <ol className="space-y-4">
        {steps.map((s, i) => {
          const state = i < at ? "done" : i === at ? "now" : "next";
          const skipped = s.id === "ai" && stage === "counting" && at > i;
          return (
            <li key={s.id} className="flex items-start gap-3">
              <span
                className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full ${
                  state === "done" ? "bg-ok-soft text-ok" : state === "now" ? "text-accent" : "border border-line text-ink-3"
                }`}
              >
                {state === "done" ? <Check size={12} strokeWidth={2.6} /> : state === "now" ? <Spinner /> : null}
              </span>
              <div>
                <p className={`text-[14px] font-semibold ${state === "next" ? "text-ink-3" : "text-ink"}`}>
                  {s.label}
                  {skipped ? <span className="ml-2 text-[12px] font-normal text-ink-3">not needed</span> : null}
                </p>
                <p className="text-[12.5px] text-ink-3">{s.detail}</p>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function EmptyState({ onSample }: { onSample: (id: string) => void }) {
  return (
    <div className="card px-6 py-10 text-center sm:px-10 sm:py-14">
      <div className="mx-auto mb-5 grid h-12 w-12 place-items-center rounded-2xl bg-accent-soft text-accent">
        <Needles size={22} />
      </div>
      <h2 className="text-[20px] font-semibold tracking-[-0.02em]">Proof a pattern before you knit it</h2>
      <p className="mx-auto mt-2 max-w-md text-[14.5px] leading-relaxed text-ink-2">
        Paste any written knitting pattern. Stitchproof counts every row in every size and shows you exactly where the numbers don&apos;t add up.
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-2">
        <button type="button" className="btn btn-primary" onClick={() => onSample("beanie")}>
          Try the flawed beanie <Arrow size={16} />
        </button>
        <button type="button" className="btn btn-secondary" onClick={() => onSample("scarf")}>
          Try a prose pattern
        </button>
      </div>
      <p className="mt-6 text-[12px] text-ink-3">Samples are original patterns written for Stitchproof; the beanie has three planted errata.</p>
    </div>
  );
}

function Summary({
  proof, reading, sizeIndex, setSizeIndex, elapsed, errata, onApplyAll, onShare, onReport, patternId, onSelect, selectedKey,
}: {
  proof: Proof;
  reading: Reading;
  sizeIndex: number;
  setSizeIndex: (i: number) => void;
  elapsed: number | null;
  errata: { list: Erratum[]; fixedText: string | null } | null;
  onApplyAll: () => void;
  onShare: () => void;
  onReport: () => void;
  patternId: string | null;
  onSelect: (k: string | null) => void;
  selectedKey: string | null;
}) {
  const { program, verdict } = proof;
  const size = proof.sizes[sizeIndex];
  const rowsWord = program.rows.some((r) => r.round) ? "rounds" : "rows";
  const counted = program.rows.filter((r) => r.number !== null).length;
  const nSizes = program.sizes.length;
  const fixable = errata?.list.filter((e) => e.fix).length ?? 0;

  const headline =
    verdict === "proven"
      ? nSizes > 1 ? `Every ${rowsWord.slice(0, -1)} adds up in all ${nSizes} sizes.` : `Every ${rowsWord.slice(0, -1)} adds up.`
      : verdict === "issues"
        ? errata
          ? `${errata.list.length} ${errata.list.length === 1 ? "erratum" : "errata"} found${nSizes > 1 ? ` across ${nSizes} sizes` : ""}.`
          : "Finding the root causes…"
        : verdict === "partial"
          ? counted > 0
            ? "Everything Stitchproof could count adds up."
            : "No rows could be read, so nothing was checked yet."
          : "Stitchproof couldn't find any rows.";

  return (
    <div className="card rise overflow-hidden">
      <div className="grid gap-6 p-5 sm:grid-cols-[1fr_220px] sm:p-6">
        <div className="min-w-0">
          <VerdictPill verdict={verdict} unchecked={counted === 0} />
          <h2 className="mt-3 text-[22px] leading-tight font-semibold tracking-[-0.025em] sm:text-[26px]">{headline}</h2>
          {program.title && <p className="mt-1 text-[14px] text-ink-2">{program.title}</p>}
          <dl className="mt-4 flex flex-wrap gap-x-5 gap-y-1.5 text-[12.5px] text-ink-3 tnum">
            <div><dt className="inline">Counted </dt><dd className="inline font-medium text-ink-2">{counted} {rowsWord}</dd></div>
            <div><dt className="inline">Sizes </dt><dd className="inline font-medium text-ink-2">{nSizes}</dd></div>
            <div>
              <dt className="inline">Read </dt>
              <dd className="inline font-medium text-ink-2">
                {reading.readBy === "ai"
                  ? `with AI · ${reading.model?.split("/").pop()} · checked by the parser`
                  : reading.aiNote
                    ? "offline · AI reader not used"
                    : "offline · no AI needed"}
              </dd>
            </div>
            {elapsed !== null && <div><dt className="inline">in </dt><dd className="inline font-medium text-ink-2">{elapsed < 1000 ? `${Math.max(1, Math.round(elapsed))} ms` : `${(elapsed / 1000).toFixed(1)} s`}</dd></div>}
          </dl>
          {nSizes > 1 && (
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <span className="text-[12.5px] text-ink-3">Size</span>
              <div className="segmented" role="group" aria-label="Size">
                {program.sizes.map((s, i) => (
                  <button key={s} type="button" aria-pressed={i === sizeIndex} onClick={() => setSizeIndex(i)}>
                    <span className="inline-flex items-center gap-1.5">
                      {proof.sizes[i].issues > 0 ? (
                        <span className="h-1.5 w-1.5 rounded-full bg-bad" aria-label="has issues" />
                      ) : (
                        <span className="h-1.5 w-1.5 rounded-full bg-ok" aria-label="adds up" />
                      )}
                      {s}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="mt-5 flex flex-wrap gap-2">
            {verdict === "issues" && fixable > 0 && errata?.fixedText && (
              <button type="button" className="btn btn-primary" onClick={onApplyAll}>
                <Wand size={16} /> Apply {fixable === 1 ? "the fix" : `all ${fixable} fixes`}
              </button>
            )}
            {patternId && verdict !== "empty" && (
              <Link href={`/knit/${patternId}`} className={`btn ${verdict === "issues" ? "btn-secondary" : "btn-primary"}`}>
                Start knitting <Arrow size={16} />
              </Link>
            )}
            {verdict !== "empty" && (
              <button type="button" className="btn btn-ghost" onClick={onShare} title="Copy a private link with this pattern inside it">
                <Link2 size={16} /> Share proof
              </button>
            )}
            {verdict === "issues" && errata && (
              <button type="button" className="btn btn-ghost" onClick={onReport} title="Copy a plain-text summary of the errata, with a link to this proof">
                <Doc size={16} /> Copy report
              </button>
            )}
          </div>
        </div>
        <div className="rounded-2xl border border-line bg-surface-2 p-3">
          <ShapePreview program={program} result={size} compact height={220} selectedKey={selectedKey} onSelect={onSelect} />
          <p className="mt-2 text-center text-[11px] text-ink-3 tnum">
            Shape · {size.size} · cast on {size.rows.find((r) => r.after > 0)?.after ?? 0}
          </p>
        </div>
      </div>
    </div>
  );
}

function VerdictPill({ verdict, unchecked }: { verdict: Proof["verdict"]; unchecked?: boolean }) {
  if (verdict === "proven")
    return <span className="pill bg-ok-soft text-ok"><Check size={13} strokeWidth={2.6} /> Proven</span>;
  if (verdict === "issues")
    return <span className="pill bg-bad-soft text-bad"><Alert size={13} strokeWidth={2.2} /> Doesn&apos;t add up</span>;
  if (verdict === "partial")
    return <span className="pill bg-warn-soft text-warn"><Question size={13} strokeWidth={2.2} /> {unchecked ? "Not verified" : "Partly verified"}</span>;
  return <span className="pill bg-paper-2 text-ink-2">Nothing to count</span>;
}

function ErrataList({
  errata, sizes, onApply, onShow,
}: {
  errata: { list: Erratum[]; fixedText: string | null } | null;
  sizes: string[];
  onApply: (e: Erratum) => void;
  onShow: (e: Erratum) => void;
}) {
  if (!errata) {
    return (
      <div className="card flex items-center gap-3 px-5 py-4 text-[13.5px] text-ink-2">
        <Spinner /> Tracing each problem back to its cause and testing fixes…
      </div>
    );
  }
  return (
    <div className="space-y-3">
      {errata.list.map((e, i) => (
        <article key={e.id} className="card rise overflow-hidden" style={{ animationDelay: `${i * 60}ms` }} aria-label={`Erratum ${i + 1}`}>
          <div className="flex flex-wrap items-center gap-2 px-5 pt-4">
            <span className="grid h-6 w-6 place-items-center rounded-full bg-bad-soft text-[12px] font-bold text-bad tnum">{i + 1}</span>
            <h3 className="text-[15px] font-semibold tracking-[-0.01em]">{e.rowLabel}</h3>
            {sizes.length > 1 && <span className="pill bg-paper-2 text-ink-2">size {e.sizeName}</span>}
            <button type="button" onClick={() => onShow(e)} className="ml-auto text-[12.5px] font-medium text-accent hover:underline">
              Show row
            </button>
          </div>
          <div className="px-5 pt-2 pb-4">
            {e.messages.slice(0, 2).map((m, j) => (
              <p key={j} className="text-[14px] leading-relaxed text-ink">{m}</p>
            ))}
            {e.knockOn > 0 && (
              <p className="mt-1 text-[12.5px] text-ink-3">
                {e.knockOn} later {e.knockOn === 1 ? "row goes" : "rows go"} wrong because of this one.
              </p>
            )}
          </div>
          {e.fix ? (
            <div className="border-t border-line bg-surface-2 px-5 py-4">
              <p className="text-[12.5px] font-semibold text-ink-2">Suggested fix</p>
              <p className="mt-1 text-[14px] font-medium text-ink">{e.fix.description}</p>
              <DiffLine before={e.fix.lineBefore} after={e.fix.lineAfter} />
              <p className="mt-2 text-[12.5px] leading-relaxed text-ink-2">{e.fix.evidence}</p>
              <div className="mt-3">
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => onApply(e)}>
                  <Wand size={14} /> Apply fix
                </button>
              </div>
            </div>
          ) : (
            <div className="border-t border-line bg-surface-2 px-5 py-3 text-[12.5px] text-ink-3">
              No single-number edit makes this row work. It needs a closer look.
            </div>
          )}
        </article>
      ))}
    </div>
  );
}

/** Show a one-line diff, highlighting only the characters that changed. */
function DiffLine({ before, after }: { before: string; after: string }) {
  let s = 0;
  while (s < before.length && s < after.length && before[s] === after[s]) s++;
  let eb = before.length;
  let ea = after.length;
  while (eb > s && ea > s && before[eb - 1] === after[ea - 1]) {
    eb--;
    ea--;
  }
  return (
    <div className="mono mt-3 overflow-x-auto rounded-xl border border-line bg-surface text-[12px] leading-6" tabIndex={0} role="group" aria-label="Line before and after the fix">
      <div className="flex gap-3 px-3 whitespace-pre text-ink-2">
        <span className="select-none text-bad">−</span>
        <span>
          {before.slice(0, s)}
          <del className="rounded bg-bad-soft px-0.5 text-bad no-underline">{before.slice(s, eb)}</del>
          {before.slice(eb)}
        </span>
      </div>
      <div className="flex gap-3 border-t border-line px-3 whitespace-pre text-ink">
        <span className="select-none text-ok">+</span>
        <span>
          {after.slice(0, s)}
          <ins className="rounded bg-ok-soft px-0.5 font-semibold text-ok no-underline">{after.slice(s, ea)}</ins>
          {after.slice(ea)}
        </span>
      </div>
    </div>
  );
}

function UnreadList({ reading }: { reading: Reading }) {
  const { unread } = reading.program;
  return (
    <div className="card overflow-hidden">
      <div className="flex items-center gap-2 border-b border-line px-5 py-3.5">
        <Question size={16} className="text-warn" />
        <h2 className="text-[15px] font-semibold tracking-[-0.01em]">
          {unread.length} {unread.length === 1 ? "line" : "lines"} not counted
        </h2>
        <span className="ml-auto">
          <NotationGuide label="What it reads" />
        </span>
      </div>
      <ul className="divide-y divide-line">
        {unread.map((u) => (
          <li key={`${u.line}-${u.text}`} className="px-5 py-3">
            <p className="mono text-[12px] text-ink">{u.text}</p>
            <p className="mt-0.5 text-[12.5px] text-ink-3">{u.reason}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ReadingDisclosure({ reading }: { reading: Reading }) {
  return (
    <details className="card group overflow-hidden">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-5 py-3.5 text-[14px] font-semibold tracking-[-0.01em]">
        How Stitchproof read this
        <span className="text-[12px] font-normal text-ink-3">
          AI translation{reading.attempts && reading.attempts > 1 ? `, repaired once after the parser flagged it` : ""}. Every number copied, not corrected
        </span>
        <span className="ml-auto text-ink-3 transition-transform group-open:rotate-90">›</span>
      </summary>
      <pre className="mono max-h-80 overflow-auto border-t border-line bg-surface-2 px-5 py-4 text-[12px] leading-6 text-ink-2">{reading.readingText}</pre>
    </details>
  );
}
