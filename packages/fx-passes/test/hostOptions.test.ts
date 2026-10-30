import { afterEach, describe, expect, it, vi } from "vitest";
import { createRuntimeHost } from "@frapx/core";
import { createPasses } from "../src/createPasses";

// Wraps the real host so a test can read the options the runtime passes it.
vi.mock("@frapx/core", async (importActual) => {
  const actual = await importActual<typeof import("@frapx/core")>();
  return { ...actual, createRuntimeHost: vi.fn(actual.createRuntimeHost) };
});

const passes = [{ name: "scene", fragment: "void main() {}" }];

const hostOptions = () => vi.mocked(createRuntimeHost).mock.lastCall?.[0];

afterEach(() => {
  vi.mocked(createRuntimeHost).mockClear();
});

describe("createPasses host options", () => {
  it("respects reduced motion by default, as fx-canvas 1.0 does", () => {
    createPasses({ passes }).destroy();
    expect(hostOptions()?.respectReducedMotion).toBe(true);
  });

  it("lets respectReducedMotion: false opt out", () => {
    createPasses({ passes, respectReducedMotion: false }).destroy();
    expect(hostOptions()?.respectReducedMotion).toBe(false);
  });

  it("reports status changes through onStatusChange", async () => {
    const onStatusChange = vi.fn();
    const fx = createPasses({ passes, onStatusChange });
    expect(onStatusChange).not.toHaveBeenCalled();

    // Node has no window, so the host settles on unsupported.
    await fx.ready.catch(() => {});
    fx.destroy();

    expect(onStatusChange.mock.calls.flat()).toEqual(["unsupported", "destroyed"]);
  });
});
