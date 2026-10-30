// Minimal KTX 2.0 reader: the header, the level index and the key/value data.
// Enough for the uncompressed / zstd single-level files 3dsdf-texture writes;
// the DFD is not interpreted.

const IDENTIFIER = [0xab, 0x4b, 0x54, 0x58, 0x20, 0x32, 0x30, 0xbb, 0x0d, 0x0a, 0x1a, 0x0a];
const HEADER_LENGTH = 80;
const LEVEL_LENGTH = 24;

export type Ktx2Level = {
  /** A view into the file; supercompressed when `supercompressionScheme` > 0. */
  data: Uint8Array;
  uncompressedByteLength: number;
};

export type Ktx2 = {
  vkFormat: number;
  typeSize: number;
  pixelWidth: number;
  pixelHeight: number;
  pixelDepth: number;
  supercompressionScheme: number;
  levels: Ktx2Level[];
  /** Raw values by key, without the trailing NUL. */
  keyValue: Map<string, Uint8Array>;
};

export const readKtx2 = (bytes: Uint8Array): Ktx2 => {
  if (
    bytes.byteLength < HEADER_LENGTH ||
    !IDENTIFIER.every((value, index) => bytes[index] === value)
  ) {
    throw new Error("Not a KTX 2.0 file (identifier mismatch).");
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const u32 = (offset: number) => view.getUint32(offset, true);
  // Offsets and lengths are uint64; files this reader handles stay below 2^53.
  const u64 = (offset: number) => u32(offset) + u32(offset + 4) * 2 ** 32;

  const levelCount = Math.max(1, u32(40));
  const levels: Ktx2Level[] = [];
  for (let level = 0; level < levelCount; level += 1) {
    const at = HEADER_LENGTH + level * LEVEL_LENGTH;
    if (at + LEVEL_LENGTH > bytes.byteLength) {
      throw new Error("KTX2 level index is truncated.");
    }
    const offset = u64(at);
    const length = u64(at + 8);
    if (offset + length > bytes.byteLength) {
      throw new Error(`KTX2 level ${level} lies outside the file.`);
    }
    levels.push({
      data: bytes.subarray(offset, offset + length),
      uncompressedByteLength: u64(at + 16)
    });
  }

  return {
    vkFormat: u32(12),
    typeSize: u32(16),
    pixelWidth: u32(20),
    pixelHeight: u32(24),
    pixelDepth: u32(28),
    supercompressionScheme: u32(44),
    levels,
    keyValue: readKeyValue(bytes, u32(56), u32(60))
  };
};

const readKeyValue = (
  bytes: Uint8Array,
  offset: number,
  length: number
): Map<string, Uint8Array> => {
  const entries = new Map<string, Uint8Array>();
  if (offset + length > bytes.byteLength) {
    throw new Error("KTX2 key/value data lies outside the file.");
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const decoder = new TextDecoder();
  const end = offset + length;
  let at = offset;
  while (at + 4 <= end) {
    const pairLength = view.getUint32(at, true);
    const pair = bytes.subarray(at + 4, at + 4 + pairLength);
    const nul = pair.indexOf(0);
    if (nul < 0) break;
    let value = pair.subarray(nul + 1);
    if (value[value.length - 1] === 0) value = value.subarray(0, -1);
    entries.set(decoder.decode(pair.subarray(0, nul)), value);
    at += 4 + Math.ceil(pairLength / 4) * 4;
  }
  return entries;
};
