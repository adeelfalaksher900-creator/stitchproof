/**
 * Private share links: the pattern travels inside the link's #fragment,
 * compressed. Fragments are never sent to a server, so nothing is stored anywhere.
 */
const PREFIX = "#p=";

async function pipe(bytes: Uint8Array, stream: CompressionStream): Promise<Uint8Array> {
  const out = new Response(new Blob([bytes as BlobPart]).stream().pipeThrough(stream));
  return new Uint8Array(await out.arrayBuffer());
}

function toBase64Url(bytes: Uint8Array): string {
  let bin = "";
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(s: string): Uint8Array {
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

const MAX_CHARS = 20_000;

/** Decompress, but stop early: a crafted link could otherwise expand to gigabytes and crash the tab. */
async function inflateCapped(bytes: Uint8Array): Promise<string | null> {
  const reader = new Blob([bytes as BlobPart]).stream().pipeThrough(new DecompressionStream("deflate-raw")).getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > MAX_CHARS * 4) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  return size ? new TextDecoder().decode(await new Blob(chunks as BlobPart[]).arrayBuffer()) : null;
}

export async function shareUrl(text: string, origin = window.location.origin): Promise<string> {
  const packed = await pipe(new TextEncoder().encode(text), new CompressionStream("deflate-raw"));
  return `${origin}/proof${PREFIX}${toBase64Url(packed)}`;
}

/** The shared pattern in a URL hash, or null if there isn't a valid one. */
export async function readShared(hash: string): Promise<string | null> {
  if (!hash.startsWith(PREFIX)) return null;
  try {
    const text = await inflateCapped(fromBase64Url(hash.slice(PREFIX.length)));
    return text && text.length <= MAX_CHARS ? text : null;
  } catch {
    return null;
  }
}
