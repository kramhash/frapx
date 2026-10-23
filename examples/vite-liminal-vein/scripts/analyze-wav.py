"""Turn the loop WAV into step values for src/rhythm.ts: hi-hat strength per
16th and energy per bar. The kick is not detectable in this mix (dense bass),
so rhythm.ts writes it by hand.

Usage: python3 -I scripts/analyze-wav.py audio/music.wav src/song.analysis.json [--bpm 128] [--bars 8]
"""

import argparse
import json
import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from importlib import import_module

check = import_module("check-wav")

# Rise ratios (energy after / before the step) below this are bleed, not hits.
HAT_FLOOR = 1.6
# Bar loudness range mapped to energy 0.2..1.0.
ENERGY_MIN = 0.2


def rms(samples, rate, t0, t1):
    i0, i1 = max(0, int(t0 * rate)), min(len(samples), int(t1 * rate))
    segment = samples[i0:i1]
    return math.sqrt(sum(x * x for x in segment) / max(1, len(segment)))


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("wav")
    parser.add_argument("out")
    parser.add_argument("--bpm", type=float, default=128)
    parser.add_argument("--bars", type=int, default=8)
    args = parser.parse_args()

    rate = int(check.probe(args.wav)["sample_rate"])
    step = 60 / args.bpm / 4
    steps = args.bars * 16

    hats = check.decode(args.wav, rate, "highpass=f=6000")
    ratios = [
        rms(hats, rate, i * step + 0.001, i * step + 0.02) / (rms(hats, rate, i * step - 0.015, i * step - 0.002) + 1e-6)
        for i in range(steps)
    ]
    # The first step has no "before" inside the file; read it from the loop's end.
    ratios[0] = rms(hats, rate, 0.001, 0.02) / (rms(hats, rate, steps * step - 0.015, steps * step - 0.002) + 1e-6)
    top = math.log(max(ratios))
    hat = [round(max(0.0, math.log(r) - math.log(HAT_FLOOR)) / (top - math.log(HAT_FLOOR)), 3) if r > HAT_FLOOR else 0.0 for r in ratios]

    full = check.decode(args.wav, rate)
    bar_seconds = step * 16
    levels = [20 * math.log10(rms(full, rate, b * bar_seconds, (b + 1) * bar_seconds) + 1e-9) for b in range(args.bars)]
    low, high = min(levels), max(levels)
    energy = [round(ENERGY_MIN + (1 - ENERGY_MIN) * (level - low) / ((high - low) or 1), 3) for level in levels]

    Path(args.out).write_text(json.dumps({
        "source": Path(args.wav).name,
        "bpm": args.bpm,
        "bars": args.bars,
        "barLevelsDb": [round(level, 2) for level in levels],
        "hat": hat,
        "energy": energy,
    }, indent=2) + "\n")
    print(f"wrote {args.out}: {sum(1 for v in hat if v > 0)}/{steps} hat steps, energy {energy}")


if __name__ == "__main__":
    main()
