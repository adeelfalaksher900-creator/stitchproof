import type { Erratum } from "./stitch/errata";

export interface ReportInput {
  title: string;
  counted: number;
  rowsWord: string;
  sizes: string[];
  errata: Erratum[];
  link: string;
  /** Rows counting can't settle (worked to a measurement, short rows), in the size with the most. */
  unverified?: number;
  date?: Date;
}

/**
 * A plain-text summary a buyer can paste into a message to the seller or a marketplace report,
 * or a designer can send to test knitters. Every claim in it is a count anyone can redo by hand.
 */
export function proofReport({ title, counted, rowsWord, sizes, errata, link, unverified = 0, date = new Date() }: ReportInput): string {
  const day = date.toISOString().slice(0, 10);
  const sizeText = sizes.length > 1 ? `${sizes.length} sizes (${sizes.join(", ")})` : "1 size";
  const lines = [
    `Stitchproof report: ${title}`,
    `Checked ${counted} ${rowsWord} in ${sizeText} on ${day}.`,
    errata.length === 0
      ? unverified > 0 ? "Result: every row that can be counted adds up." : "Result: every row adds up."
      : `Result: ${errata.length} ${errata.length === 1 ? "place where" : "places where"} the stitch counts don't add up.`,
    ...(unverified > 0 ? [`Not counted: ${unverified} ${unverified === 1 ? "row" : "rows"} worked to a measurement or with short rows, which counting can't settle.`] : []),
    "",
  ];
  errata.forEach((e, i) => {
    lines.push(`${i + 1}. ${e.rowLabel}${sizes.length > 1 ? `, size ${e.sizeName}` : ""}: ${e.messages.join(" ")}`);
    if (e.knockOn > 0) lines.push(`   ${e.knockOn} later ${e.knockOn === 1 ? "row goes" : "rows go"} wrong because of this one.`);
    if (e.fix) lines.push(`   Likely fix: ${e.fix.description}`);
  });
  lines.push(
    "",
    "How this was checked: each stitch uses and makes a fixed number of stitches (k2tog uses 2, makes 1), so every row's count is plain arithmetic.",
    `See every row: ${link}`,
  );
  return lines.join("\n");
}
