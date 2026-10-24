---
doc: spec
status: approved
---
<!-- Approved under the learner's standing instruction to proceed autonomously.
     Technical choices are the agent's recommendations, recorded as such. -->

# Stitchproof — Technical Spec

## How This Works, In Plain Language
Stitchproof has three pieces.

1. **The reader** turns pattern text into a *stitch program*: a list of rows, each a list of stitch instructions like "k2", "repeat [p2, k2] to the end", with each number held once per size. The **offline reader** is ordinary code that understands standard notation. When it meets a line it doesn't understand, the **AI reader** (a small language model behind a server route) rewrites the pattern into Stitchproof's strict notation — and that rewrite is fed straight back through the offline reader, so the AI's work is checked before anything is counted.
2. **The counter** (simulator) executes the program for each size. Every stitch type is defined by how many stitches it *uses* and how many it *makes* (k2tog uses 2, makes 1; a yarn-over uses 0, makes 1). Walking a row adds those up, works out how many times a "to the end" repeat runs, and compares the result with the count the pattern promised.
3. **The fixer** tries small changes to the numbers in a broken row, re-counts the whole pattern for each one, and suggests the change that makes the most rows agree.

The screens just show these results: the proof, a shape preview, plain-English rows, and a row-by-row Knit mode. Everything a knitter saves lives in their browser.

Why this shape: counting must be exact, so it's plain code with unit tests. Language is messy, so that's the only job given to AI — and only when the offline reader can't cope.

## The Core Journey Through the System
PRD ref: `prd.md > The Core Journey`.

1. Knitter pastes text in **PatternEditor** → presses Proof.
2. `lib/stitch/parse.ts` reads every line. If all lines are understood → step 4.
3. Otherwise the browser POSTs the text to `/api/read`. The route asks the model (via Vercel AI Gateway) for canonical notation, parses it with the same `parse.ts`; on parse errors it asks the model once more with the errors listed; returns the canonical text + which model was used.
4. `lib/stitch/simulate.ts` runs the program for every size → per-row results.
5. `lib/stitch/fixes.ts` searches fixes for each issue.
6. **ProofView** renders summary, size switcher, **ShapePreview**, **RowList**, **IssueCard**s. The proof and text are saved by `lib/store.ts` to localStorage.
7. **Start knitting** → `/knit/[id]` reads the saved pattern, re-proofs it, and **KnitView** steps through rows, saving the row index on every move.

## Stack
- **Next.js 16 (App Router) + React 19 + TypeScript** — one project for pages and the AI route; first-class on Vercel. https://nextjs.org/docs
- **Tailwind CSS 4** for layout utilities, with design tokens as CSS variables. https://tailwindcss.com/docs
- **AI SDK (`ai` v7) `generateText`** with a gateway model string. https://ai-sdk.dev/docs
- **Vercel AI Gateway** — on Vercel, authenticates with the deployment's OIDC token, so no API key is stored anywhere. Model: `anthropic/claude-haiku-5.5` by default, overridable with `STITCHPROOF_MODEL`. https://vercel.com/docs/ai-gateway
- **Zod 4** for validating the API request/response. https://zod.dev
- **Motion** (`motion/react`) for the few functional animations. https://motion.dev
- **Vitest** for unit tests of the reader, counter and fixer; **Playwright** for end-to-end browser tests. https://vitest.dev , https://playwright.dev

## Where It Runs and How Someone Tries It
- Browser app; Node 22.
- Local: `npm install`, `npm run dev`, open http://localhost:3000. Without AI credentials the app runs in offline-reader mode (the clean and flawed samples work fully; the prose sample shows the AI-unavailable fallback).
- Local AI: set `AI_GATEWAY_API_KEY` in `.env.local` (see `.env.example`).
- Deployment (chosen, for judges): Vercel project `stitchproof`; production URL recorded in README. AI uses OIDC automatically.
- Demo recording: production URL, flawed-beanie sample → proof → apply fixes → Knit mode → reload.

## Look and Feel
PRD ref: `prd.md > Look and Feel`.
- Tokens (light): `--paper #F7F5F0`, `--surface #FFFFFF`, `--ink #1A1916`, `--ink-2 #55524B`, `--ink-3 #8A867D`, `--line #E6E2D9`, `--accent #3E3BC9` (indigo dye), `--ok #2F7A4D`, `--warn #A86A12`, `--bad #C0392B`. Dark: `--paper #121110`, `--surface #1B1A18`, `--ink #F2EFE8`, accent `#8C8AF5`, etc.
- Type: Inter (UI, tight tracking on headings), Instrument Serif (hero headline only), JetBrains Mono (notation, counts). Loaded with `next/font`.
- Radii 12/16; hairline 1px borders; shadows only on floating elements.
- Motion: staggered row reveal (≤ 400 ms total), shape preview bars grow from the centre, cross-fades on status. `prefers-reduced-motion` disables them.
- Copy tone: plain, specific, kind ("Row 15 makes 70 stitches; the pattern says 72.").

## Components

### Offline reader — `lib/stitch/parse.ts`
Tokenises each line; recognises headers (`Title:`, `Sizes:`), cast-on/bind-off lines, `Row n` / `Rnd n` / `Rows a–b` lines with optional side `(RS)`, row-repeat lines ("Rows 3–12: rep rows 1–2"), stitch lists with repeats (`*…; rep from * to end | to last n sts | n times | around`, `[…] n times`, `[…] to end`), whole-row shorthands (`knit`, `purl`, `k to end`), size groups `8 (9, 10)` and declared counts `(72 (81, 90) sts)` / `— 72 sts`. Records the character span of every number so fixes can edit the text. Unknown lines become `unread` entries.
PRD ref: `prd.md > Reading the pattern (AI translation)`.

### Stitch dictionary — `lib/stitch/stitches.ts`
Code → `{ uses, makes, kind, name }` for k, p, ktbl, ptbl, sl, k2tog, p2tog, ssk, ssp, k3tog, p3tog, sssk, sk2p, s2kp, cdd, yo, m1, m1l, m1r, m1p, kfb, pfb, kyok, inc, dec, BO, CO.

### Counter — `lib/stitch/simulate.ts`
Runs a program for one size → per-row `{ before, uses, makes, after, declared, status, messages }`. Solves "to end"/"to last n" repeats as `(before − used − leave) / usesPerRepeat`, which must be a whole number ≥ 0.
PRD ref: `prd.md > The proof`.

### Fixer — `lib/stitch/fixes.ts`
For an issue row: candidates = each number in that row (±1…±3) and the declared count set to the computed count; re-simulate the size; score by total issues (lower is better), then by size of change. Evidence string from the next row's behaviour.
PRD ref: `prd.md > Suggested fixes`.

### Explainer — `lib/stitch/explain.ts`
Program row → plain English for one size, and glossary lookup.
PRD ref: `prd.md > Plain-English rows`.

### AI reader route — `app/api/read/route.ts`
POST `{ text }` (≤ 20,000 chars, Zod-validated). Best-effort rate limit per IP (10/min). Calls `generateText` with a system prompt describing canonical notation and examples; validates with `parse.ts`; one repair retry with the parser's errors; 25 s timeout. Returns `{ canonical, model, attempts, unread[] }` or `{ error }` with 4xx/5xx.
PRD ref: `prd.md > Reading the pattern (AI translation)`.

### Proof orchestration — `lib/stitch/proof.ts`
`proofPattern(text, { mode })` → reading + per-size results + issues + fixes + verdict. Pure, used by the page and tests.

### UI — `components/`
`TopBar`, `PatternEditor`, `SampleMenu`, `ProofView` (summary, size switch, reading disclosure), `ShapePreview` (SVG), `RowList` + `RowItem`, `StitchStrip` (SVG), `IssueCard`, `KnitView`, `PatternList`, `CountingMachine` (home figure).
PRD ref: `prd.md > Screens and Layout`.

### Storage — `lib/store.ts`
localStorage key `stitchproof:v1:patterns` → `SavedPattern[]`; every read/write wrapped in try/catch.
PRD ref: `prd.md > Knit mode and saved progress`, `prd.md > My patterns`.

## Data Model
```ts
type Sized = number[];                       // one value per size (length 1 = all sizes)
type Op =
  | { t: 'st'; code: string; n: Sized; span?: Span }
  | { t: 'toEnd'; code: string; leave: Sized }
  | { t: 'rep'; body: Op[]; times: Sized }
  | { t: 'repEnd'; body: Op[]; leave: Sized }
  | { t: 'co'; n: Sized } | { t: 'bo'; n: Sized | 'all' } | { t: 'note'; text: string };
type Row = { key: string; label: string; line: number; side?: 'RS' | 'WS'; round: boolean;
             ops: Op[]; declared?: Sized; unverifiable?: string };
type Program = { title?: string; sizes: string[]; rows: Row[]; unread: { line: number; text: string }[] };
type SavedPattern = { id: string; title: string; text: string; sizes: string[]; verdict: string;
                      sizeIndex: number; row: number; updatedAt: number };
```
Program and results are derived, never stored; only text + place are saved.

## File Structure
```
.
├── app/
│   ├── layout.tsx            # fonts, TopBar, theme tokens
│   ├── globals.css           # tokens + Tailwind
│   ├── page.tsx              # Home
│   ├── proof/page.tsx        # Proof screen (client)
│   ├── knit/[id]/page.tsx    # Knit mode (client)
│   ├── patterns/page.tsx     # My patterns (client)
│   └── api/read/route.ts     # AI reader
├── components/               # UI pieces listed above
├── lib/
│   ├── stitch/               # types, stitches, parse, simulate, fixes, explain, proof
│   ├── ai/prompt.ts          # system prompt + examples for canonical notation
│   ├── samples.ts            # three labelled sample patterns
│   └── store.ts              # localStorage
├── tests/
│   ├── unit/                 # vitest
│   └── e2e/                  # playwright
├── devpost/                  # scope, prd, spec, checklist, app map
├── .env.example
└── README.md
```

## External Services and Dependencies
- **Vercel AI Gateway** — `generateText({ model: 'anthropic/claude-haiku-5.5', system, prompt, maxOutputTokens: 4000, temperature: 0 })`. Auth: OIDC on Vercel (`VERCEL_OIDC_TOKEN`), or `AI_GATEWAY_API_KEY` locally. Cost ≈ $0.10 / $0.50 per million input/output tokens; a typical pattern is < 3k tokens round-trip (≈ $0.002). Free monthly gateway credit covers the judging period. Docs: https://vercel.com/docs/ai-gateway
- **Vercel hosting** (Hobby). No database.

## Important Failure Modes
- **AI unavailable / out of credit / slow** → route returns 503; UI shows offline reading with unread lines marked and a clear banner.
- **AI returns malformed notation** → parser errors fed back once; if still malformed, unparsed lines are shown as "couldn't read", never guessed.
- **Ambiguous pattern semantics** (short rows, "work even until 6 in") → row marked *can't verify* instead of guessed.
- **localStorage blocked** → app works; saving silently disabled with a small note.

## What Was Simplified and Why
- **Browser storage** instead of accounts + database — judges try it instantly; a full version would add Supabase auth and sync.
- **Canonical text** as the AI's output instead of JSON — the same parser checks both paths and the knitter can read it.
- **In-memory rate limit** instead of a shared store — adequate for a demo; a full version would use a KV store.

## Decisions and Open Issues
- Agent decisions (learner delegated): Next.js on Vercel; AI Gateway via OIDC (no stored keys); AI only when the offline reader fails; local storage only.
- Genuine uncertainty: *will a small model translate prose patterns reliably into strict notation?* Investigation during the build: run the prose sample through the deployed route several times and check the parser accepts the output; the repair retry is the planned mitigation.
- Open: none blocking.
