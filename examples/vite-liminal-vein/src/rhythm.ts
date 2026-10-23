import type { UniformSource } from "@frapx/fx-passes";
import { LOOP_SECONDS } from "./scene.glsl";
import analysis from "./song.analysis.json";

// The song (audio/music.wav): 128 BPM, 4/4, 8 bars, which is LOOP_SECONDS.
// Bars 1–4 are calm, bars 5–8 the drop. The kick is four on the floor
// throughout, written here because the mix hides it from analysis; the hats
// come from scripts/analyze-wav.py, which writes song.analysis.json.
const BPM = 128;
const BEAT_SECONDS = 60 / BPM;
const STEP_SECONDS = BEAT_SECONDS / 4;
const BEATS = Math.round(LOOP_SECONDS / BEAT_SECONDS);
const DROP_BEAT = BEATS / 2;
/** The drop's last bar eases back to calm, so the loop wraps without a jump. */
const SETTLE_BEAT = BEATS - 4;
const DROP_SECONDS = DROP_BEAT * BEAT_SECONDS;
const SETTLE_SECONDS = SETTLE_BEAT * BEAT_SECONDS;

/** How fast each flare fades, per second. */
const FLASH_DECAY = 35;
// Gone by the middle of the beat, so the light falls dark between kicks.
const PULSE_DECAY = 9;
const HAT_DECAY = 30;

/** Cruising speed in the drop, relative to the calm's. */
const DROP_SPEED = 2.2;
/** How far each kick of the drop throws the camera forward, in beats of drop cruising. */
const LUNGE_BEATS = 0.5;
/** How fast a lunge settles, per second. */
const LUNGE_RATE = 10;
/** Seconds a kick takes to turn the cross-section into the next shape. */
const MORPH_SECONDS = 0.16;
/** Roll of a kick's swing, in radians. */
const KICK_ROLL = 0.07;

const wrap = (x: number, length: number): number => ((x % length) + length) % length;
const clamp01 = (x: number): number => Math.min(Math.max(x, 0), 1);

const smoothstep = (edge0: number, edge1: number, x: number): number => {
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
};

/** The integral of smoothstep(edge0, edge1, x) from 0 to x, for 0 ≤ edge0. */
const smoothstepIntegral = (edge0: number, edge1: number, x: number): number => {
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return (edge1 - edge0) * (t * t * t - (t * t * t * t) / 2) + Math.max(x - edge1, 0);
};

// The drop: rises through the last beat of the calm, settles over the last bar.
const RISE_START = DROP_SECONDS - BEAT_SECONDS;
const dropAt = (t: number): number =>
  smoothstep(RISE_START, DROP_SECONDS, t) - smoothstep(SETTLE_SECONDS, LOOP_SECONDS, t);
const dropIntegral = (t: number): number =>
  smoothstepIntegral(RISE_START, DROP_SECONDS, t) - smoothstepIntegral(SETTLE_SECONDS, LOOP_SECONDS, t);

// Kicks of the drop that lunge and turn the cross-section: all but the last bar's.
const isActionBeat = (beat: number): boolean => beat >= DROP_BEAT && beat < SETTLE_BEAT;
const ACTION_BEATS = SETTLE_BEAT - DROP_BEAT;
const LUNGE = LUNGE_BEATS * DROP_SPEED * BEAT_SECONDS;
const LUNGE_SPAN = 1 - Math.exp(-LUNGE_RATE * BEAT_SECONDS);
const LOOP_TRAVEL = LOOP_SECONDS + (DROP_SPEED - 1) * dropIntegral(LOOP_SECONDS) + ACTION_BEATS * LUNGE;

/**
 * How far the camera has come through the loop, 0–1: cruising at the calm's
 * speed, faster through the drop, and thrown forward by each of its kicks.
 * Exactly one loop's distance, so the end meets the start.
 */
const travelAt = (t: number, beat: number, sinceBeat: number): number => {
  const cruise = t + (DROP_SPEED - 1) * dropIntegral(t);
  const lunges = Math.min(Math.max(beat - DROP_BEAT, 0), ACTION_BEATS);
  const lunge = isActionBeat(beat) ? (1 - Math.exp(-LUNGE_RATE * sinceBeat)) / LUNGE_SPAN : 0;
  return (cruise + (lunges + lunge) * LUNGE) / LOOP_TRAVEL;
};

const easeOutCubic = (x: number): number => 1 - (1 - clamp01(x)) ** 3;

/**
 * Which cross-section the tunnel has, 0–3: 0 a circle, 1 a hexagon, 2 a star,
 * then back to the circle at 3. Each kick of the drop turns it into the next;
 * twelve kicks come round to the circle before the last bar.
 */
const shapeAt = (beat: number, sinceBeat: number): number => {
  const turned = Math.min(Math.max(beat - DROP_BEAT, 0), ACTION_BEATS);
  const turning = isActionBeat(beat) ? easeOutCubic(sinceBeat / MORPH_SECONDS) : 0;
  return wrap(turned + turning, 3);
};

/** A kick's swing: up fast, back down to 0 by the next beat. */
const swing = (beat: number, sinceBeat: number): number => {
  if (!isActionBeat(beat)) return 0;
  const x = sinceBeat / BEAT_SECONDS;
  const direction = beat % 2 === 0 ? 1 : -1;
  return direction * Math.sin(Math.PI * (1 - (1 - x) ** 2));
};

const HATS: readonly number[] = analysis.hat;

/** The last hat at or before `step`, and the seconds since it. */
const lastHat = (step: number, local: number): { value: number; elapsed: number } | null => {
  for (let back = 0; back < HATS.length; back++) {
    const index = wrap(step - back, HATS.length);
    const value = HATS[index] ?? 0;
    if (value > 0) return { value, elapsed: local - (step - back) * STEP_SECONDS };
  }
  return null;
};

/**
 * The song as uniforms, a pure function of time, so a frame renders the same
 * however it is reached; fx-passes reads it at every sample's time, so beats
 * are motion blurred like everything else.
 *
 * - `flash` (the kick itself, gone in ~80 ms), `pulse` (its afterglow) and
 *   `hat`: 0–1, decaying since they fired.
 * - `energy`: the bar's loudness, 0.2–1.
 * - `drop`: 0 in the calm, 1 in the drop, eased between.
 * - `travel`, `shape`, `kickRoll`: the camera's way through the loop, the
 *   cross-section (see shapeAt) and a kick's roll.
 */
export const songRhythm: UniformSource = {
  get(time) {
    const t = wrap(time, LOOP_SECONDS);
    const beat = Math.min(Math.floor(t / BEAT_SECONDS), BEATS - 1);
    const sinceBeat = t - beat * BEAT_SECONDS;
    const step = Math.min(Math.floor(t / STEP_SECONDS), HATS.length - 1);
    const hat = lastHat(step, t);
    const bar = Math.floor(beat / 4);
    return {
      flash: Math.exp(-FLASH_DECAY * sinceBeat),
      pulse: Math.exp(-PULSE_DECAY * sinceBeat),
      hat: hat ? hat.value * Math.exp(-HAT_DECAY * hat.elapsed) : 0,
      energy: analysis.energy[bar] ?? 0,
      drop: dropAt(t),
      travel: travelAt(t, beat, sinceBeat),
      shape: shapeAt(beat, sinceBeat),
      kickRoll: KICK_ROLL * swing(beat, sinceBeat)
    };
  }
};
