// Builds small KTX2 files laid out like 3dsdf-texture's output (docs/format.md):
// header, one level index entry, a 44-byte DFD, key/value data, then level 0
// on a 4-byte boundary.

export type BuildOptions = {
  vkFormat?: number;
  size?: readonly [number, number, number];
  scheme?: number;
  /** Level 0 as stored (already compressed for scheme 2). */
  level: Uint8Array;
  uncompressedByteLength?: number;
  /** `null` leaves the key out. */
  meta?: Record<string, unknown> | null;
  identifier?: number[];
};

export const IDENTIFIER = [0xab, 0x4b, 0x54, 0x58, 0x20, 0x32, 0x30, 0xbb, 0x0d, 0x0a, 0x1a, 0x0a];

export const defaultMeta = {
  version: 1,
  bboxMin: [-1, -1, -1],
  bboxMax: [1, 1, 1],
  voxelSize: 0.5,
  units: "local",
  axis: "y_up_gltf",
  sign: "negative_inside",
  decode: { scale: 1, offset: 0 },
  source: { object: "Test", triangles: 12, backend: "cpu" }
};

const align4 = (n: number) => Math.ceil(n / 4) * 4;

export const buildKtx2 = ({
  vkFormat = 76,
  size = [4, 4, 4],
  scheme = 0,
  level,
  uncompressedByteLength = level.byteLength,
  meta = defaultMeta,
  identifier = IDENTIFIER
}: BuildOptions): ArrayBuffer => {
  const encoder = new TextEncoder();
  const pairs: Array<[string, Uint8Array]> = [["KTXwriter", encoder.encode("test\0")]];
  if (meta !== null) pairs.unshift(["3dsdf.meta", encoder.encode(`${JSON.stringify(meta)}\0`)]);
  const kvParts = pairs.map(([key, value]) => {
    const keyBytes = encoder.encode(`${key}\0`);
    const length = keyBytes.byteLength + value.byteLength;
    const part = new Uint8Array(4 + align4(length));
    new DataView(part.buffer).setUint32(0, length, true);
    part.set(keyBytes, 4);
    part.set(value, 4 + keyBytes.byteLength);
    return part;
  });
  const kvLength = kvParts.reduce((sum, part) => sum + part.byteLength, 0);

  const dfdOffset = 80 + 24;
  const dfdLength = 44;
  const kvOffset = dfdOffset + dfdLength;
  const levelOffset = align4(kvOffset + kvLength);
  const bytes = new Uint8Array(levelOffset + level.byteLength);
  const view = new DataView(bytes.buffer);
  const u32 = (offset: number, value: number) => view.setUint32(offset, value, true);

  bytes.set(identifier, 0);
  u32(12, vkFormat);
  u32(16, vkFormat === 9 ? 1 : vkFormat === 76 ? 2 : 4);
  u32(20, size[0]);
  u32(24, size[1]);
  u32(28, size[2]);
  u32(32, 0);
  u32(36, 1);
  u32(40, 1);
  u32(44, scheme);
  u32(48, dfdOffset);
  u32(52, dfdLength);
  u32(56, kvOffset);
  u32(60, kvLength);
  u32(80, levelOffset);
  u32(88, level.byteLength);
  u32(96, uncompressedByteLength);
  u32(dfdOffset, dfdLength);

  let at = kvOffset;
  for (const part of kvParts) {
    bytes.set(part, at);
    at += part.byteLength;
  }
  bytes.set(level, levelOffset);
  return bytes.buffer;
};

/** Little-endian bytes of a typed array. */
export const bytesOf = (values: Uint8Array | Uint16Array | Float32Array): Uint8Array =>
  new Uint8Array(values.buffer, values.byteOffset, values.byteLength);
