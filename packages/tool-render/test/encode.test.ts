import { describe, expect, it } from "vitest";
import { join } from "node:path";
import { audioDurationMismatch, ffmpegArgs, parseAudioProbe, videoFileName } from "../src/encode";

describe("ffmpegArgs", () => {
  it("encodes the range from its first frame with BT.709 tags", () => {
    const args = ffmpegArgs("prores", 30, [120, 239], "frames.mov");
    expect(args.slice(0, 13)).toEqual([
      "-y",
      "-hide_banner",
      "-loglevel",
      "error",
      "-framerate",
      "30",
      "-start_number",
      "120",
      "-i",
      "frame_%05d.png",
      "-frames:v",
      "120",
      "-vf"
    ]);
    expect(args).toContain("prores_ks");
    expect(args).toContain("yuv422p10le");
    const filter = args[args.indexOf("-vf") + 1]!;
    // Odd sizes are padded to even ones for chroma subsampling.
    expect(filter.startsWith("pad=ceil(iw/2)*2:ceil(ih/2)*2,")).toBe(true);
    expect(filter).toContain("setparams=color_primaries=bt709:color_trc=bt709");
    expect(args[args.length - 1]).toBe("frames.mov");
  });

  it("uses yuv420p H.264 with faststart", () => {
    const args = ffmpegArgs("h264", 24, [0, 9], "frames.mp4");
    expect(args).toEqual(expect.arrayContaining(["libx264", "yuv420p", "+faststart"]));
    expect(args).not.toContain("-map");
  });

  it("cuts the audio to a sub-range and maps it as the second stream", () => {
    const args = ffmpegArgs("prores", 30, [120, 239], "frames.mov", "/music/song.wav");
    const input = args.indexOf("/music/song.wav");
    expect(args.slice(input - 5, input + 5)).toEqual([
      "-ss",
      "4",
      "-t",
      "4",
      "-i",
      "/music/song.wav",
      "-map",
      "0:v",
      "-map",
      "1:a"
    ]);
    // The audio input comes after the frames, so the maps match -i order.
    expect(input).toBeGreaterThan(args.indexOf("frame_%05d.png"));
    expect(args).toEqual(expect.arrayContaining(["-c:a", "pcm_s24le"]));
  });

  it("encodes the audio as AAC 320k for H.264", () => {
    const args = ffmpegArgs("h264", 60, [0, 899], "frames.mp4", "/music/song.wav");
    expect(args.slice(args.indexOf("-ss"), args.indexOf("-ss") + 4)).toEqual(["-ss", "0", "-t", "15"]);
    expect(args).toEqual(expect.arrayContaining(["-c:a", "aac", "-b:a", "320k"]));
  });
});

describe("parseAudioProbe", () => {
  it("reads the duration of a file with an audio stream", () => {
    expect(parseAudioProbe("codec_type=audio\nduration=15.000000\n", "song.wav")).toBe(15);
  });

  it("refuses a file without audio or without a duration", () => {
    // A video-only file still has a format duration.
    expect(() => parseAudioProbe("duration=15.000000\n", "silent.mp4")).toThrow("silent.mp4 has no audio stream.");
    expect(() => parseAudioProbe("codec_type=audio\nduration=N/A\n", "live.aac")).toThrow("no duration");
    expect(() => parseAudioProbe("", "x.png")).toThrow("no audio stream");
  });
});

describe("audioDurationMismatch", () => {
  it("accepts up to one frame either way", () => {
    expect(audioDurationMismatch(15, 15, 60)).toBeNull();
    expect(audioDurationMismatch(15 + 1 / 60, 15, 60)).toBeNull();
    expect(audioDurationMismatch(15 - 0.01, 15, 60)).toBeNull();
  });

  it("reports a short or long file in ms and frames", () => {
    // The lab's bad export: 1292 samples short at 44.1 kHz.
    expect(audioDurationMismatch(15 - 1292 / 44100, 15, 60)).toBe(
      "The audio is 14.971 s, 29.3 ms shorter than the page's 15.000 s (1.8 frames at 60 fps)."
    );
    expect(audioDurationMismatch(16, 15, 30)).toContain("1000.0 ms longer");
  });
});

describe("videoFileName", () => {
  it("names the video after the output directory", () => {
    // Expected paths are built with node:path, not hardcoded "/" separators:
    // videoFileName() joins with the platform separator, so a "/" literal
    // fails on Windows (reported in #55). The expected value must use the
    // same join() as the implementation, not resolve(): on Windows a
    // root-relative input resolves to a drive letter the join never adds.
    const out = "/renders/poolrooms-4k";
    expect(videoFileName(out, "prores")).toBe(join(out, "poolrooms-4k.mov"));
    expect(videoFileName(`${out}/`, "h264")).toBe(join(out, "poolrooms-4k.mp4"));
  });
});
