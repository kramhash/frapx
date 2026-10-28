import { describe, expect, it } from "vitest";
import { createReporter, formatDuration } from "../src/progress";
import type { RenderEvent } from "../src/types";

/** A stream stand-in that records every write, like the real CLI stream. */
const fakeStream = (isTTY: boolean) => {
  const chunks: string[] = [];
  const stream = {
    isTTY,
    write: (chunk: string) => {
      chunks.push(chunk);
      return true;
    }
  } as unknown as NodeJS.WriteStream;
  return { stream, chunks };
};

const frameEvent = (frame: number, completed: number, total: number): RenderEvent => ({
  type: "frame",
  frame,
  completed,
  total,
  secondsPerFrame: 0.5
});

describe("formatDuration", () => {
  it("prints bare seconds below a minute", () => {
    expect(formatDuration(0)).toBe("0s");
    expect(formatDuration(59)).toBe("59s");
  });

  it("rounds to the nearest second", () => {
    expect(formatDuration(59.6)).toBe("1m 00s");
    expect(formatDuration(59.4)).toBe("59s");
  });

  it("prints minutes and zero-padded seconds", () => {
    expect(formatDuration(60)).toBe("1m 00s");
    expect(formatDuration(90)).toBe("1m 30s");
    expect(formatDuration(3599)).toBe("59m 59s");
  });

  it("prints hours and zero-padded minutes past an hour", () => {
    expect(formatDuration(3600)).toBe("1h 00m");
    expect(formatDuration(3661)).toBe("1h 01m");
    expect(formatDuration(7325)).toBe("2h 02m");
  });

  it("clamps negative input to zero", () => {
    expect(formatDuration(-1)).toBe("0s");
    expect(formatDuration(-3600)).toBe("0s");
  });
});

describe("createReporter", () => {
  it("writes one newline-terminated line per event when not a TTY", () => {
    const { stream, chunks } = fakeStream(false);
    const report = createReporter(stream);

    report(frameEvent(0, 1, 3));
    report(frameEvent(1, 2, 3));

    expect(chunks).toEqual([
      "  frame 0 · 1/3 · 0.5s/frame · about 1s left\n",
      "  frame 1 · 2/3 · 0.5s/frame · about 1s left\n"
    ]);
  });

  it("rewrites a single status line for frame progress on a TTY", () => {
    const { stream, chunks } = fakeStream(true);
    const report = createReporter(stream);

    report(frameEvent(0, 1, 2));
    report(frameEvent(1, 2, 2));

    expect(chunks).toEqual([
      "\r\x1b[2K  frame 0 · 1/2 · 0.5s/frame · about 1s left",
      "\r\x1b[2K  frame 1 · 2/2 · 0.5s/frame · done"
    ]);
  });

  it("clears the status line before the next regular line", () => {
    const { stream, chunks } = fakeStream(true);
    const report = createReporter(stream);

    report(frameEvent(0, 1, 2));
    report({ type: "encode", encoder: "h264", file: "/out/movie.mp4" });

    expect(chunks).toEqual([
      "\r\x1b[2K  frame 0 · 1/2 · 0.5s/frame · about 1s left",
      "\r\x1b[2K",
      "  Encoded h264: /out/movie.mp4\n"
    ]);
  });

  it("does not clear a status line that was never shown", () => {
    const { stream, chunks } = fakeStream(true);
    const report = createReporter(stream);

    report({ type: "warning", message: "software renderer" });

    expect(chunks).toEqual(["  Warning: software renderer\n"]);
  });

  it("prints the start banner and the retry, page-error and warning lines", () => {
    const { stream, chunks } = fakeStream(false);
    const report = createReporter(stream);

    report({
      type: "start",
      url: "http://localhost:5173/",
      renderer: "ANGLE (Apple M2)",
      fps: 30,
      resolution: [1280, 720],
      range: [0, 59],
      pending: 60
    });
    report({ type: "retry", reason: "navigation timed out", attempt: 2 });
    report({ type: "page-error", message: "prepare() threw" });
    report({ type: "warning", message: "software renderer" });

    expect(chunks).toEqual([
      "Rendering http://localhost:5173/\n",
      "  GPU: ANGLE (Apple M2)\n",
      "  Size: 1280 × 720\n",
      "  Frames 0–59 at 30 fps: 60 to render, 0 already done\n",
      "  navigation timed out; opening the page again (attempt 2)\n",
      "  [page] prepare() threw\n",
      "  Warning: software renderer\n"
    ]);
  });
});
