/** Original, correct patterns used to evaluate the fixer (written for Stitchproof). */
export const CLEAN_PATTERNS: Record<string, string> = {
  dishcloth: `CO 44 sts.
Rows 1–4: Knit.
Row 5 (RS): K3, *p2, k2; rep from * to last 5 sts, p2, k3.
Row 6 (WS): K5, *p2, k2; rep from * to last 3 sts, k3.
Rows 7–40: Rep rows 5–6.
Rows 41–44: Knit. (44 sts)
BO all sts.`,

  beanie: `Sizes: Child (Adult S, Adult L)
CO 88 (96, 104) sts. Join to work in the rnd.
Rnds 1–12: *K2, p2; rep from * around.
Rnds 13–40: Knit.
Rnd 41: *K9 (10, 11), k2tog; rep from * around. (80 (88, 96) sts)
Rnd 42: Knit.
Rnd 43: *K8 (9, 10), k2tog; rep from * around. (72 (80, 88) sts)
Rnd 44: Knit.
Rnd 45: *K7 (8, 9), k2tog; rep from * around. (64 (72, 80) sts)
Rnd 46: Knit.
Rnd 47: *K6 (7, 8), k2tog; rep from * around. (56 (64, 72) sts)
Rnd 48: Knit.
Rnd 49: *K5 (6, 7), k2tog; rep from * around. (48 (56, 64) sts)
Rnd 50: *K4 (5, 6), k2tog; rep from * around. (40 (48, 56) sts)
Rnd 51: *K3 (4, 5), k2tog; rep from * around. (32 (40, 48) sts)
Rnd 52: *K2 (3, 4), k2tog; rep from * around. (24 (32, 40) sts)
Rnd 53: *K1 (2, 3), k2tog; rep from * around. (16 (24, 32) sts)
Rnd 54: *K2tog; rep from * around. (8 (12, 16) sts)
Cut yarn, draw through rem sts.`,

  cowl: `Sizes: Regular (Wide)
CO 96 (120) sts. Join to work in the rnd.
Rnds 1–6: *K2, p2; rep from * around.
Rnd 7: *Yo, k2, ssk, k2tog, k2, yo; rep from * around. (96 (120) sts)
Rnd 8: Knit.
Rnds 9–40: Rep rnds 7–8.
Rnds 41–46: *K2, p2; rep from * around. (96 (120) sts)
BO all sts in pattern.`,

  bias: `CO 4 sts.
Row 1: Knit.
Row 2: K2, yo, k to end. (5 sts)
Rows 3–37: Rep row 2. (40 sts)
Row 38: K1, k2tog, yo, k2tog, k to end. (39 sts)
Rows 39–73: Rep row 38. (4 sts)
BO all sts.`,

  sleeve: `Sizes: S (M, L)
CO 56 (60, 64) sts. Join to work in the rnd.
Rnds 1–10: *K2, p2; rep from * around.
Rnd 11: K1, k2tog, k to last 3 sts, ssk, k1. (54 (58, 62) sts)
Rnds 12–16: Knit.
Rnds 17–46: Rep rnds 11–16. (44 (48, 52) sts)
Rnds 47–56: *K2, p2; rep from * around.
BO all sts in pattern.`,

  scarf: `CO 31 sts.
Rows 1–6: Knit.
Row 7: K3, m1, k to last 3 sts, m1, k3. (33 sts)
Row 8: K3, *p1, k1; rep from * to last 4 sts, p1, k3.
Rows 9–107: Rep row 8.
Rows 108–113: Knit.
BO all sts.`,
};
