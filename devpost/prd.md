---
doc: prd
status: approved
---
<!-- Approved under the learner's standing instruction to proceed autonomously;
     product decisions below are recorded as agent decisions. -->

# Stitchproof — Product Requirements

A web app that proves a knitting pattern's stitch counts add up, row by row and size by size, then walks the knitter through it. For indie designers checking a pattern before release and knitters checking one before casting on. Source: `scope.md > The Unique Kernel`, `scope.md > Who It's For`.

## The Core Journey
Source: `scope.md > The Core Loop`, `scope.md > What "Working" Looks Like`.

1. **Arrive.** The home page says what Stitchproof does in one sentence, shows how it works (a figure of the "counting machine"), and offers **Proof a pattern** and **Try a flawed sample**.
2. **Paste.** On the Proof screen the knitter pastes pattern text into the editor, or picks one of three labelled samples.
3. **Proof.** They press **Proof pattern** (or ⌘/Ctrl + Enter). A short progress line shows the real stages: *Reading → Checking the reading → Counting rows*.
4. **See the verdict.** A summary appears: rows, sizes, verdict (**Proven** / **N issues** / **N rows can't be verified**), and which reader was used (offline reader or AI reader).
5. **Inspect.** A size switcher (e.g. S · M · L) changes every number on screen. A shape preview draws the piece's width row by row. The row list shows each row's instruction, the count Stitchproof computed, the count the pattern declares, and a status mark.
6. **Fix.** Each issue explains what's wrong in plain words and, when one exists, a **suggested fix** with its evidence. **Apply fix** edits the pattern text and re-proofs it.
7. **Knit.** **Start knitting** opens Knit mode on Row 1 for the chosen size: the row in plain English, the stitch strip, and the count to expect at the end. **Next / Back** (or → / ←, space) move through rows.
8. **Return.** The pattern and the knitter's place in it are saved automatically. **My patterns** lists them; reopening one restores the row they were on.

## Screens and Layout
- **Home (`/`)** — hero statement, primary CTA, the how-it-works figure, three short "why" points, and a footer. Single column on phones.
- **Proof (`/proof`)** — two panes on desktop: the pattern editor on the left (≈40%), results on the right. On tablet/phone the panes stack: editor, then results.
- **Knit mode (`/knit/[id]`)** — a focused full-screen view with one large row card, progress bar and controls pinned to the bottom on phones.
- **My patterns (`/patterns`)** — a list of saved patterns with verdict, sizes, and progress.
A top bar on every screen: wordmark, **Proof**, **My patterns**.

## Look and Feel
Source: `scope.md > Inspiration & Identity`.
- Warm paper background (off-white, slightly warm), ink-dark text, one indigo accent for actions; green for proven, amber for can't-verify, red for errors — used only on status, never decoration.
- Typography: a clean grotesk for UI; a refined serif only for the hero headline; monospace for pattern notation and counts.
- Spacious, calm, precise. Rounded 12–16 px cards, hairline borders, soft shadows only where something floats.
- Motion is functional: rows reveal in sequence after proofing, the shape preview draws in, status changes cross-fade. Everything respects reduced motion.
- Dark mode follows the system.
- Avoid: gradients-for-decoration, glassmorphism, emoji, stock AI sparkle icons.

## Features and Behavior

### Pattern input
- Monospace editor with line numbers; accepts up to 20,000 characters.
- Samples menu with three original sample patterns, each labelled as sample data: a clean dishcloth (proves clean), a three-size beanie with deliberate errata, and a prose-style scarf that needs the AI reader.
- **Proof pattern** button and ⌘/Ctrl + Enter shortcut; disabled while empty.
- Acceptance:
  - [ ] Choosing a sample fills the editor and shows its label.
  - [ ] Pasting more than 20,000 characters shows a clear limit message and does not proof.

### Reading the pattern (AI translation)
- **Auto (default):** the offline reader tries first. If every line is understood, no AI is used. If any line isn't, the AI reader translates the whole pattern into Stitchproof's canonical notation, which the offline reader then checks; if that check fails, the AI is asked once more with the exact errors.
- **Offline only** setting: never sends text anywhere; unreadable lines are reported as such.
- After reading, the knitter can open **How Stitchproof read this** to see the canonical notation line by line.
- Acceptance:
  - [ ] The clean sample proofs with "Read offline" and no network call to the AI route.
  - [ ] The prose scarf proofs with "Read with AI" and shows its canonical reading.
  - [ ] If the AI is unavailable, the user sees "AI reader unavailable — showing what the offline reader could read" with unreadable lines marked, never a blank screen.

### The proof
- For each size, every row is executed: stitches available before the row, stitches used, stitches made, and the count after.
- A row is **proven** when it uses every available stitch and (if declared) ends at the declared count; **issue** when the declared count disagrees, the row needs more stitches than exist, a repeat doesn't fit evenly, or stitches are left unworked; **can't verify** when it contains something counting can't settle (e.g. short rows, "work even until 6 in").
- Acceptance:
  - [ ] The clean sample shows "Proven" with every row green.
  - [ ] The flawed beanie shows exactly its planted issues, each on the right row and size.

### Suggested fixes
- For each issue, Stitchproof tries small edits to that row's numbers (and the declared count) and re-runs the whole pattern; it suggests the edit that removes the most issues without creating new ones, and states its evidence (e.g. "Row 16 then works perfectly from 72 sts").
- **Apply fix** edits the text in the editor and re-proofs.
- Acceptance:
  - [ ] Applying the beanie's suggested fixes results in "Proven".

### Shape preview and stitch strip
- Shape preview: one horizontal bar per row, width = stitch count, centred, for the selected size; issue rows tinted.
- Stitch strip: for a selected row, one small mark per stitch made (knit, purl, increase, decrease, yarn-over, slip), so the row's structure can be seen.

### Plain-English rows
- Each row can be expanded into plain words ("Knit 2, then repeat *purl 2, knit 2* 19 times to the end of the row").
- Abbreviations show their meaning on hover/focus.

### Knit mode and saved progress
- Shows one row at a time for the chosen size, with plain English, stitch strip, expected count, and row X of N.
- Progress is saved per pattern in the browser on every move.
- Acceptance:
  - [ ] Going to Row 5, reloading, shows Row 5.

### My patterns
- Every proofed pattern is saved locally with title (first line or "Untitled pattern"), verdict, sizes, last row.
- Open or delete each one; empty state explains how to add one.

## States and Boundaries
- **First use** — editor empty with a hint and the samples menu highlighted.
- **Reading** — progress line with real stages; the button shows a spinner; editing is still allowed.
- **Proven** — green summary; Start knitting is the primary action.
- **Issues** — red/amber summary; first issue auto-scrolled into view.
- **Nothing readable** — "Stitchproof couldn't find any rows" with a link to the notation guide.
- **AI unavailable / rate-limited** — falls back to offline reading with an explicit message.
- **Persistence** — patterns and progress live in this browser only (localStorage); clearing site data removes them. Nothing is stored on a server.

## Product Decisions
- Proof, don't generate — the product never writes patterns; generation is where AI patterns fail. (Agent decision under the learner's delegation.)
- AI only where needed — the offline reader runs first, so standard patterns are proofed for free, instantly and privately.
- The AI's output is inspectable text, not a hidden structure, so a knitter can see exactly how their pattern was read.
- No accounts — judges and knitters can try it instantly.

## What We're Building
Home, Proof, Knit mode, My patterns; offline reader; AI reader route with validation and one repair retry; per-size simulator; issue detection; fix search; shape preview; stitch strip; plain English; local persistence; three samples.

## Deferred From the POC
- Crochet support — turning-chain conventions need their own rules.
- Photo/PDF import — OCR is a separate failure mode.
- Shareable reports — needs storage and a copyright policy for paid patterns.

Revisions during the build (made at the learner's request after the judge-style audits):
- Text-based PDFs are now read in the browser (no upload, no OCR); photos and scanned PDFs are still deferred.
- Shareable proofs shipped without storage: the pattern is compressed into the link's fragment, so nothing is uploaded or kept, and the copyright question doesn't arise. A plain-text report can be copied or downloaded (a first step toward the tech-edit report below).

## Possible Later Enhancements
Gauge and yardage checks per size; chart (grid) support; a designer "tech-edit report" export; Ravelry integration.

## Non-Goals
- Pattern generation or "AI design" — the opposite of the product's purpose.
- Measuring fit or drape — counts only.
- Cables/colourwork semantics — they don't change counts.

## Open Questions
- Which AI model gives the best translation reliability for cost? (Can wait — decided in spec, configurable.)
