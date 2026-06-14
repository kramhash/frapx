export type Rgb = [number, number, number];
export type Rgba = [number, number, number, number];

export const hexToRgb = (hex: string): Rgb => {
  const value = normalizeHex(hex);
  return [
    parseChannel(value.slice(0, 2)),
    parseChannel(value.slice(2, 4)),
    parseChannel(value.slice(4, 6)),
  ];
};

export const hexToRgba = (hex: string): Rgba => {
  const value = normalizeHex(hex);
  return [
    parseChannel(value.slice(0, 2)),
    parseChannel(value.slice(2, 4)),
    parseChannel(value.slice(4, 6)),
    value.length === 8 ? parseChannel(value.slice(6, 8)) : 1,
  ];
};

const normalizeHex = (hex: string): string => {
  const value = hex.startsWith("#") ? hex.slice(1) : hex;

  if (
    !/^(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(
      value,
    )
  ) {
    throw new Error(`Invalid hex color: ${hex}`);
  }

  if (value.length === 3 || value.length === 4) {
    return Array.from(value, (char) => `${char}${char}`).join("");
  }

  return value;
};

const parseChannel = (hex: string): number => Number.parseInt(hex, 16) / 255;
