---
doc: scope
status: approved
---
<!-- Approval note: the learner delegated idea selection and planning decisions to the agent
     for this run ("work independently… don't ask me about project preferences"), and will
     review the finished proof of concept. Decisions below are the agent's, made on that basis. -->

# Stitchproof

A compiler for knitting patterns: paste a pattern, and Stitchproof proves every row's stitch count adds up — for every size — before you knit it.

## The Unique Kernel
AI translates messy pattern prose into a small, typed **stitch program**; plain deterministic code — not the AI — then executes that program row by row and proves the arithmetic. When a row doesn't add up, Stitchproof pinpoints it and searches for the smallest fix that makes the numbers agree ("Row 7 says 44 sts, the instructions make 42. Likely fix: *rep 10 times*, not 11.").

The split matters: language models write pattern-shaped text without tracking a running total, so the model is only trusted to *read*. Counting is done by code that can't hallucinate.

## Who It's For
**Maya, an indie knitwear designer** about to publish a three-size hat pattern on Ravelry. Today she re-counts every row of every size by hand or pays a tech editor ($20–50/hr) to do it, and errata still slip through.

Secondary: **a newer knitter** who bought a cheap pattern (possibly AI-generated) and wants to know, before casting on, whether it even adds up — and who needs the abbreviations explained as they go.

## The Core Loop
1. Paste a pattern (or open a sample).
2. Stitchproof reads it, then shows a row-by-row proof: computed vs. declared stitch counts per size, a picture of the fabric's shape, and any rows that don't add up with a suggested fix.
3. Switch to **Knit mode**: one row at a time, expanded into plain words, with the expected count and a row counter that remembers where you are.

They come back because the pattern they're knitting is saved with their place in it, and because every new pattern gets proofed first.

## Inspiration & Identity
Calm, precise, premium — an instrument, not a toy. Apple-style restraint: warm paper background, ink-dark type, one confident accent, monospace for pattern notation. Reads like a well-set craft book crossed with a code editor's diagnostics panel.
References: Apple Human Interface Guidelines (clarity, deference, depth) — https://developer.apple.com/design/human-interface-guidelines/ ; knitting-app shots on Dribbble for the warm craft palette — https://dribbble.com/search/knitting-app .

## Why This Matters to the Learner
They want an original, genuinely useful entry that shows the best practice this hackathon teaches: use AI for what it is good at, and verify everything else.

## What "Working" Looks Like
Open the site → click the "Flawed beanie" sample → press **Proof pattern** → within seconds see "18 rows · 3 sizes · 2 issues", the shape preview of the hat crown narrowing, and Row 15 flagged in size L with a one-click suggested fix. Apply the fix → every row turns green. Then **Start knitting** → Row 1 in plain English, tap **Next row**, reload the page, and the counter is still on Row 2.

The "oh, that's cool" beat: the tool finding a real mistake a human missed and proposing the exact fix.

## The POC Boundary
- Knitting patterns written as text (rows or rounds), US abbreviations.
- Multi-size counts written as `80 (88, 96)`.
- Stitch library covering common knit/purl, increases, decreases, cast-on/bind-off, repeats (`*…; rep from *`, `[…] n times`, "to end", "to last n sts"), and row-range repeats ("Rows 3–10: rep rows 1–2").
- AI reading step (pattern text → stitch program) with a deterministic fallback reader for standard notation.
- Row-by-row proof, issue list with suggested fixes, shape preview, plain-English expansion.
- Knit mode with a saved row counter; patterns saved in the browser.

## Later
- Crochet (the stitch-program model already supports "consumes / produces"; needs turning-chain rules).
- Chart (grid) import from images.
- Gauge & yardage checks per size.
- Shareable proof reports for test knitters.

## Explicitly Cut
- **Accounts / cloud sync** — not needed to prove the kernel; browser storage keeps the demo frictionless for judges.
- **Generating new patterns** — the opposite of the point; generation is where AI patterns go wrong.
- **Photo/PDF upload** — OCR adds a failure mode that doesn't prove the kernel; paste text instead.
- **Colourwork and cables** — they don't change stitch counts; out of scope for a count proof.
