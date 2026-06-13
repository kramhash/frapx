import { describe, expect, it } from "vitest";
import { fromUniformName, toUniformName } from "../src/internal/names";

describe("uniform names", () => {
  it("adds u_ when missing", () => {
    expect(toUniformName("progress")).toBe("u_progress");
    expect(toUniformName("u_progress")).toBe("u_progress");
  });

  it("removes u_ when requested", () => {
    expect(fromUniformName("u_progress")).toBe("progress");
    expect(fromUniformName("progress")).toBe("progress");
  });
});
