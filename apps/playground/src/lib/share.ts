/**
 * Share URLs: `#v1=` + base64url(deflate-raw(JSON)). Only the GLSL source and
 * the slider values travel (growth plan decision 22). No dependency:
 * CompressionStream does the deflate.
 */

const PREFIX = "#v1=";

export type SharedState = {
  readonly source: string;
  readonly values: Readonly<Record<string, readonly number[]>>;
};

// A link longer than this, or one that inflates past MAX_BYTES, is refused
// instead of loading megabytes of source into the editor and the compiler.
const MAX_HASH_LENGTH = 64 * 1024;
const MAX_BYTES = 1024 * 1024;

const pipe = async (
  bytes: Uint8Array<ArrayBuffer>,
  stream: CompressionStream | DecompressionStream
): Promise<Uint8Array<ArrayBuffer>> => {
  const reader = new Blob([bytes]).stream().pipeThrough(stream).getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_BYTES) {
      await reader.cancel();
      throw new Error("Share data too large");
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
};

const toBase64Url = (bytes: Uint8Array): string => {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

const fromBase64Url = (text: string): Uint8Array<ArrayBuffer> => {
  if (!/^[A-Za-z0-9_-]*$/.test(text)) throw new Error("Not base64url");
  const binary = atob(text.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
};

const isValues = (value: unknown): value is Record<string, number[]> =>
  typeof value === "object" &&
  value !== null &&
  !Array.isArray(value) &&
  Object.values(value).every(
    (entry) =>
      Array.isArray(entry) &&
      entry.length >= 1 &&
      entry.length <= 4 &&
      entry.every((n) => typeof n === "number" && Number.isFinite(n))
  );

export const encodeShare = async (state: SharedState): Promise<string> => {
  const json = JSON.stringify({ s: state.source, u: state.values });
  const compressed = await pipe(new TextEncoder().encode(json), new CompressionStream("deflate-raw"));
  return `${PREFIX}${toBase64Url(compressed)}`;
};

/**
 * The state in `hash`, `null` when there is no share hash, or an `Error`
 * when there is one that cannot be read (wrong version, corrupt data).
 */
export const decodeShare = async (hash: string): Promise<SharedState | null | Error> => {
  if (hash === "" || hash === "#") return null;
  if (!hash.startsWith(PREFIX)) return new Error("Unsupported share link");
  if (hash.length > MAX_HASH_LENGTH) return new Error("Share link too long");
  try {
    const bytes = await pipe(fromBase64Url(hash.slice(PREFIX.length)), new DecompressionStream("deflate-raw"));
    const parsed: unknown = JSON.parse(new TextDecoder().decode(bytes));
    if (typeof parsed !== "object" || parsed === null) return new Error("Bad share data");
    const source: unknown = "s" in parsed ? parsed.s : undefined;
    const values: unknown = "u" in parsed ? parsed.u : {};
    if (typeof source !== "string" || !isValues(values)) return new Error("Bad share data");
    return { source, values };
  } catch (error) {
    return error instanceof Error ? error : new Error(String(error));
  }
};
