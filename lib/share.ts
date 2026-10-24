/**
 * Private share links: the pattern travels inside the link's #fragment,
 * compressed. Fragments are never sent to a server, so nothing is stored anywhere.
 */
const PREFIX = "#p=";

async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
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

export async function shareUrl(text: string, origin = window.location.origin): Promise<string> {
  const packed = await pipe(new TextEncoder().encode(text), new CompressionStream("deflate-raw"));
  return `${origin}/proof${PREFIX}${toBase64Url(packed)}`;
}

/** The shared pattern in a URL hash, or null if there isn't a valid one. */
export async function readShared(hash: string): Promise<string | null> {
  if (!hash.startsWith(PREFIX)) return null;
  try {
    const bytes = await pipe(fromBase64Url(hash.slice(PREFIX.length)), new DecompressionStream("deflate-raw"));
    const text = new TextDecoder().decode(bytes);
    return text.length > 0 && text.length <= 20_000 ? text : null;
  } catch {
    return null;
  }
}
