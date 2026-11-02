import { describe, expect, it } from "vitest";
import { decodeShare, encodeShare } from "./share";

const state = {
  source: "precision highp float;\n// ünïcode ✓\nuniform float u_speed; // @range 0 4 @default 1.5\nvoid main() {}",
  values: { speed: [0.25], tint: [1, 0.5, 0] }
};

describe("share hash", () => {
  it("round-trips the source and values", async () => {
    const hash = await encodeShare(state);
    expect(hash.startsWith("#v1=")).toBe(true);
    expect(hash.slice(4)).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(await decodeShare(hash)).toEqual(state);
  });

  it("returns null without a hash", async () => {
    expect(await decodeShare("")).toBeNull();
    expect(await decodeShare("#")).toBeNull();
  });

  it("rejects other versions", async () => {
    const hash = await encodeShare(state);
    expect(await decodeShare(hash.replace("#v1=", "#v2="))).toBeInstanceOf(Error);
    expect(await decodeShare("#section")).toBeInstanceOf(Error);
  });

  it("rejects corrupt data", async () => {
    expect(await decodeShare("#v1=not*base64")).toBeInstanceOf(Error);
    expect(await decodeShare("#v1=AAAA")).toBeInstanceOf(Error);
  });

  it("rejects well-formed data of the wrong shape", async () => {
    const wrong = await encodeShare({ source: "x", values: { a: [] } });
    expect(await decodeShare(wrong)).toBeInstanceOf(Error);
  });
});
