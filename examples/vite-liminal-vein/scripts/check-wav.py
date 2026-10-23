"""Check a loop WAV against the bar grid before syncing the picture to it.

Usage: python3 -I scripts/check-wav.py audio/music.wav [--bpm 128] [--bars 8]

Reports length vs. the bar grid, sample rate, peak level, and the offset of
the hi-hat 16th grid (onsets in a 6 kHz high-passed copy, decoded with ffmpeg).
An offset near 0 ms means beat 1 sits at sample 0.
"""

import argparse
import array
import json
import math
import subprocess
import sys


def probe(path):
    out = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "stream=sample_rate,channels,codec_name,duration_ts", "-of", "json", path],
        check=True, capture_output=True, text=True,
    ).stdout
    return json.loads(out)["streams"][0]


def decode(path, rate, filters=None, mono=True):
    cmd = ["ffmpeg", "-v", "error", "-i", path] + (["-ac", "1"] if mono else [])
    if filters:
        cmd += ["-af", filters]
    cmd += ["-ar", str(rate), "-f", "f32le", "-"]
    samples = array.array("f")
    samples.frombytes(subprocess.run(cmd, check=True, capture_output=True).stdout)
    return samples


def onset_strength(samples, hop):
    env = [math.sqrt(sum(x * x for x in samples[i:i + hop]) / hop) for i in range(0, len(samples) - hop, hop)]
    return [max(0.0, env[i] - env[i - 3]) if i >= 3 else 0.0 for i in range(len(env))]


def grid_offset_ms(strength, hop_ms, period_ms):
    best = (0.0, 0)
    for offset in range(int(period_ms)):
        score, t = 0.0, float(offset)
        while t / hop_ms < len(strength) - 2:
            i = int(round(t / hop_ms))
            score += max(strength[max(0, i - 1):i + 2])
            t += period_ms
        best = max(best, (score, offset))
    offset = best[1]
    return offset - period_ms if offset > period_ms / 2 else offset


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("path")
    parser.add_argument("--bpm", type=float, default=128)
    parser.add_argument("--bars", type=int, default=8)
    args = parser.parse_args()

    stream = probe(args.path)
    rate = int(stream["sample_rate"])
    length = int(stream["duration_ts"])
    expected = round(args.bars * 4 * 60 / args.bpm * rate)
    # Peak over the interleaved channels: a mono downmix scales by ~0.707 per
    # channel and reads +3 dB on a centered full-scale signal.
    peak = max(abs(x) for x in decode(args.path, rate, mono=False))
    hop = rate // 1000
    hat = onset_strength(decode(args.path, rate, "highpass=f=6000"), hop)
    offset = grid_offset_ms(hat, hop / rate * 1000, 60000 / args.bpm / 4)

    problems = []
    warnings = []
    if length != expected:
        problems.append(f"length {length} samples, expected {expected} ({(length - expected) / rate * 1000:+.1f} ms)")
    if rate not in (44100, 48000):
        problems.append(f"sample rate {rate}")
    if abs(offset) > 2:
        problems.append(f"16th grid offset {offset:+.0f} ms (beat 1 is not at sample 0)")
    # Full scale is legal in integer PCM; only lossy encodes may overshoot it.
    if peak > 10 ** (-1 / 20):
        warnings.append(f"peak {20 * math.log10(peak):+.1f} dBFS, above -1 dBFS (lossy encodes may clip)")

    print(f"{args.path}: {stream['codec_name']} {rate} Hz x{stream['channels']}, {length} samples, "
          f"peak {20 * math.log10(peak):+.1f} dBFS, 16th grid offset {offset:+.0f} ms")
    for problem in problems:
        print(f"  NG    {problem}")
    for warning in warnings:
        print(f"  WARN  {warning}")
    if not problems:
        print("  OK")
    sys.exit(1 if problems else 0)


if __name__ == "__main__":
    main()
