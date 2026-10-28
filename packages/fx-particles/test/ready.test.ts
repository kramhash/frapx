import { describe, expect, it } from "vitest";
import { DestroyedError, UnsupportedError } from "@frapx/core";
import { createParticles } from "../src/createParticles";

// Node has no window, so the instance takes the SSR no-op path.
const collectUnhandled = async (run: () => void): Promise<unknown[]> => {
  const reasons: unknown[] = [];
  const previous = process.listeners("unhandledRejection");
  const listener = (reason: unknown) => {
    reasons.push(reason);
  };
  process.removeAllListeners("unhandledRejection");
  process.on("unhandledRejection", listener);
  try {
    run();
    await new Promise((resolve) => setTimeout(resolve, 0));
  } finally {
    process.off("unhandledRejection", listener);
    for (const restore of previous) process.on("unhandledRejection", restore);
  }
  return reasons;
};

describe("createParticles ready", () => {
  it("forwards the current time from the host", () => {
    const fx = createParticles();

    fx.setTime(17.5);
    expect(fx.time).toBe(17.5);
    fx.destroy();
  });

  it("does not surface an unawaited ready on destroy", async () => {
    let fx!: ReturnType<typeof createParticles>;
    const reasons = await collectUnhandled(() => {
      fx = createParticles();
      fx.destroy();
    });

    expect(reasons).toEqual([]);
    await expect(fx.ready).rejects.toBeInstanceOf(DestroyedError);
  });

  it("does not surface an unawaited ready without a browser", async () => {
    let fx!: ReturnType<typeof createParticles>;
    const reasons = await collectUnhandled(() => {
      fx = createParticles();
    });

    expect(reasons).toEqual([]);
    expect(fx.status).toBe("unsupported");
    await expect(fx.ready).rejects.toBeInstanceOf(UnsupportedError);
  });
});
