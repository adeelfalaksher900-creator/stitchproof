/**
 * The text of a pattern PDF, read in the browser: the file never leaves the device.
 * Rows that wrap onto the next line are joined later by the parser.
 */
export async function pdfText(file: File): Promise<{ text: string; pages: number }> {
  const pdfjs = await import("pdfjs-dist");
  // Loading the worker module on the page lets pdf.js run without a separate worker file.
  await import("pdfjs-dist/build/pdf.worker.min.mjs");
  const task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()), disableFontFace: true });
  const doc = await task.promise;
  // shortcut: reads at most 60 pages, plenty for a pattern; raise it if real patterns run longer.
  const pages = Math.min(doc.numPages, 60);
  const out: string[] = [];
  for (let i = 1; i <= pages; i++) {
    const content = await (await doc.getPage(i)).getTextContent();
    let page = "";
    for (const item of content.items) if ("str" in item) page += item.str + (item.hasEOL ? "\n" : "");
    out.push(page);
  }
  await task.destroy();
  const text = out.join("\n").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  return { text, pages };
}
