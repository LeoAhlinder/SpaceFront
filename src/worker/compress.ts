/**
 * Gzip for save files, with the platform's built-in streams (browsers,
 * workers and Node all have them). Saves are mostly tile arrays and shrink
 * several times over.
 */

/** True if the bytes start with the gzip magic number. */
export function isGzip(bytes: Uint8Array): boolean {
  return bytes.length > 2 && bytes[0] === 0x1f && bytes[1] === 0x8b;
}

export async function gzip(bytes: Uint8Array): Promise<Uint8Array> {
  return pipe(bytes, new CompressionStream("gzip"));
}

/** Unzips gzip data; anything else is returned as it is. */
export async function gunzip(bytes: Uint8Array): Promise<Uint8Array> {
  return isGzip(bytes) ? pipe(bytes, new DecompressionStream("gzip")) : bytes;
}

async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream) {
  const out = new Blob([bytes as BlobPart]).stream().pipeThrough(stream);
  return new Uint8Array(await new Response(out).arrayBuffer());
}
