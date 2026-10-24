export interface Sample {
  id: string;
  name: string;
  blurb: string;
  text: string;
}

/**
 * Original sample patterns written for Stitchproof. They are sample data:
 * the beanie contains three deliberate errata so the checker has something
 * real to find, and the scarf is written in loose prose to exercise the AI reader.
 */
export const SAMPLES: Sample[] = [
  {
    id: "beanie",
    name: "Harbour Beanie — 3 sizes",
    blurb: "Sample with three planted errata",
    text: `Title: Harbour Beanie
Sizes: Child (Adult S, Adult L)
Sample pattern written for Stitchproof. It contains three deliberate errata.

CO 90 (96, 104) sts. Join to work in the rnd, being careful not to twist; pm for beg of rnd.

Brim
Rnds 1–12: *K2, p2; rep from * around.

Body
Rnds 13–40: Knit.

Crown
Rnd 41: *K9 (10, 11), k2tog; rep from * around. (80 (88, 96) sts)
Rnd 42: Knit.
Rnd 43: *K8 (9, 10), k2tog; rep from * around. (72 (80, 88) sts)
Rnd 44: Knit.
Rnd 45: *K7 (8, 9), k2tog; rep from * around. (64 (74, 80) sts)
Rnd 46: Knit.
Rnd 47: *K6 (7, 8), k2tog; rep from * around. (56 (64, 72) sts)
Rnd 48: Knit.
Rnd 49: *K5 (6, 8), k2tog; rep from * around. (48 (56, 64) sts)
Rnd 50: *K4 (5, 6), k2tog; rep from * around. (40 (48, 56) sts)
Rnd 51: *K3 (4, 5), k2tog; rep from * around. (32 (40, 48) sts)
Rnd 52: *K2 (3, 4), k2tog; rep from * around. (24 (32, 40) sts)
Rnd 53: *K1 (2, 3), k2tog; rep from * around. (16 (24, 32) sts)
Rnd 54: *K2tog; rep from * around. (8 (12, 16) sts)

Cut yarn, leaving a long tail; draw through rem sts and pull tight.`,
  },
  {
    id: "dishcloth",
    name: "Garter-Rib Dishcloth",
    blurb: "Sample that adds up",
    text: `Title: Garter-Rib Dishcloth
Sample pattern written for Stitchproof.

CO 44 sts.
Rows 1–4: Knit.
Row 5 (RS): K3, *p2, k2; rep from * to last 5 sts, p2, k3.
Row 6 (WS): K5, *p2, k2; rep from * to last 3 sts, k3.
Rows 7–40: Rep rows 5–6.
Rows 41–44: Knit. (44 sts)
BO all sts.`,
  },
  {
    id: "scarf",
    name: "Weekend Scarf — prose",
    blurb: "Sample in loose prose, read by AI",
    text: `Title: Weekend Seed-Stitch Scarf
This sample is written in loose, chatty prose on purpose, to show the AI reader.

Cast on 31 stitches with any stretchy cast-on.
Knit every row for the first six rows to make a garter border.
Next comes one increase row: knit 3, make one, knit until 3 stitches are left, make one, then knit 3 — you'll have 34 stitches now.
For the body, work this on every row: knit 3, then purl 1 and knit 1 alternately until 4 stitches remain, purl 1, and knit the last 3. Keep going until the body is 100 rows long.
Finish with six more rows of plain knitting, then bind off loosely.`,
  },
];
