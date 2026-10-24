---
doc: checklist
status: approved
---
<!-- Build order approved under the learner's standing instruction to proceed autonomously. -->

# Build Checklist

Build mode: fast (learner asked for autonomous execution; hands-on review happens at the final checkpoint)

## Slices

- [ ] **1. A pasted standard pattern is proofed row by row**
  Becomes usable: The Proof screen: paste the clean dishcloth sample, press Proof, see "Proven" and every row's computed count.
  Why now: Proves the kernel's hardest half — the offline reader and the counter — end to end, with the scaffold folded in.
  PRD ref: `prd.md > The Core Journey` (steps 2–5), `prd.md > The proof`
  Spec ref: `spec.md > Offline reader — lib/stitch/parse.ts`, `spec.md > Counter — lib/stitch/simulate.ts`, `spec.md > File Structure`
  Build: Scaffold Next.js + Tailwind + tokens; stitch dictionary, parser, simulator, proof orchestration; Proof page with editor, samples menu and summary/row list.
  Verify (mechanical): `npm test` passes parser/simulator unit tests (clean sample proven, repeats solved, multi-size parsed); `npm run build` succeeds; Playwright loads /proof, picks the clean sample, sees "Proven".
  Learner check: Open /proof, choose "Garter-rib dishcloth", press Proof, and confirm every row is green.
  Commit: `Proof standard patterns row by row`

- [ ] **2. Errata are found per size, with a suggested fix you can apply**
  Becomes usable: The flawed beanie shows its planted issues on the right rows and sizes, each with a suggested fix; Apply fix edits the text and the proof turns green.
  Why now: This is the unique kernel's payoff and the demo's "oh" moment, so it comes before polish.
  PRD ref: `prd.md > Suggested fixes`, `prd.md > The proof`
  Spec ref: `spec.md > Fixer — lib/stitch/fixes.ts`
  Build: Issue detection messages, fix search with evidence, size switcher, IssueCard with Apply fix (span-based text edit).
  Verify (mechanical): Unit tests: beanie issues match the planted list; applying every suggested fix yields zero issues. Playwright: apply fixes → "Proven".
  Learner check: Load "Flawed beanie", read the issues, apply the fixes, and confirm it ends Proven.
  Commit: `Detect errata per size and suggest fixes`

- [ ] **3. Messy prose is read by the AI reader and checked by the parser**
  Becomes usable: The prose scarf sample proofs via the AI reader with "Read with AI" and a viewable canonical reading; without AI it falls back clearly.
  Why now: The riskiest external dependency; isolated after the kernel works offline so its failure can't block the rest.
  PRD ref: `prd.md > Reading the pattern (AI translation)`
  Spec ref: `spec.md > AI reader route — app/api/read/route.ts`, `spec.md > External Services and Dependencies`
  Build: System prompt with canonical notation; route with Zod validation, rate limit, timeout, parse check and one repair retry; client fallback banner; "How Stitchproof read this" disclosure.
  Verify (mechanical): Unit test of route logic with a mocked model (valid output, repaired output, failure → 503). After deploy: POST the prose sample to the live route and confirm it parses.
  Learner check: Choose "Prose scarf", press Proof, open "How Stitchproof read this".
  Commit: `Add AI reader with parser-checked translation`

- [ ] **4. You can see the fabric and read each row in plain English**
  Becomes usable: Shape preview for the selected size, stitch strip and plain-English expansion per row, abbreviation tooltips.
  Why now: Turns the proof into something a knitter understands at a glance; needed before Knit mode reuses it.
  PRD ref: `prd.md > Shape preview and stitch strip`, `prd.md > Plain-English rows`
  Spec ref: `spec.md > Explainer — lib/stitch/explain.ts`, `spec.md > UI — components/`
  Build: ShapePreview SVG, StitchStrip SVG, explain.ts with glossary, row expansion.
  Verify (mechanical): Unit tests for explain output on repeat rows; Playwright expands a row and sees the plain-English text.
  Learner check: Switch sizes and watch the shape change; expand a row.
  Commit: `Add shape preview, stitch strip and plain-English rows`

- [ ] **5. Knit row by row, and come back to where you were**
  Becomes usable: Knit mode with keyboard controls, saved progress, and My patterns.
  Why now: Completes the core loop and the reason to return.
  PRD ref: `prd.md > Knit mode and saved progress`, `prd.md > My patterns`
  Spec ref: `spec.md > Storage — lib/store.ts`, `spec.md > Data Model`
  Build: store.ts, auto-save on proof, /knit/[id], /patterns.
  Verify (mechanical): Playwright: start knitting, advance to Row 5, reload, still Row 5; My patterns lists it.
  Learner check: Knit a few rows, reload, and confirm your place is kept.
  Commit: `Add Knit mode and saved progress`

- [ ] **6. The home page explains it with a working figure, and it's live**
  Becomes usable: Home page with the counting-machine figure and CTAs; production deployment on Vercel with AI via OIDC.
  Why now: Presentation and access for judges once the product works.
  PRD ref: `prd.md > Screens and Layout`, `prd.md > Look and Feel`
  Spec ref: `spec.md > Where It Runs and How Someone Tries It`
  Build: Home page, isometric figure, metadata/OG image, deploy, live checks.
  Verify (mechanical): `npm run build`, Playwright suite against production URL, live AI route call, Lighthouse-style checks (no console errors, mobile layout at 390 px).
  Learner check: Open the live URL on a phone and run the beanie demo.
  Commit: `Add home page and deploy`

## Hands-on Checkpoints

- [ ] Early usable behavior explored — shared with final review (learner asked to review the finished project once)
- [ ] Final kick-the-tires exploration and feedback completed

## Final Review

- [ ] Final review complete — feedback resolved and learner confirms ready to ship

## Code Tour and App Map

- [ ] Learning activity complete — guided route, focused alternative, prior practice connected, or brief recap
- [ ] Optional edit and transfer reflection addressed — offered/declined/already covered/not applicable as appropriate
- [ ] `devpost/app-map.html` generated from finished code, checked, and shown, including a project-grounded practice to reuse

Activity and evidence: [pending]
Route and stops: [pending]
Edit outcome: [pending]
Reflection: [pending]
Activity mode: [pending]

## Revisions
