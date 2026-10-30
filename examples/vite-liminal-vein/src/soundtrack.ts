import { LOOP_SECONDS } from "./scene.glsl";

/** The song as delivered to the browser; audio/music.wav is the master. */
const SONG_URL = `${import.meta.env.BASE_URL}music.m4a`;

/**
 * The song's playback position in seconds while it plays, unwrapped. The page
 * hands this to fx-passes' `timeSource` while it sounds, and returns to
 * realtime when it does not.
 */
export type SongClock = () => number;

export type Soundtrack = {
  /** Reads the loop position after loading, then starts the song, or silences it. */
  toggle(startFrom: () => number): Promise<boolean>;
  /** Returns the song's clock, or `null` while silent. */
  clock(): SongClock | null;
};

type Playing = { context: AudioContext; node: AudioBufferSourceNode; from: number; startedAt: number };

/**
 * The song joins the loop where the picture is and then leads it, so the
 * picture never jumps when the sound comes in or goes out. The artwork's time
 * comes from fx's own clock while silent (#48), so there is no separate
 * silent clock here to keep.
 */
export const createSoundtrack = (): Soundtrack => {
  let context: AudioContext | null = null;
  let song: Promise<AudioBuffer> | null = null;
  let playing: Playing | null = null;

  // The song's time, unwrapped: the loop position it started at plus how long
  // it has been sounding.
  const time = (): number => {
    if (!playing) return 0;
    // What is heard now left the context outputLatency ago.
    const heard = playing.context.currentTime - (playing.context.outputLatency || 0);
    return playing.from + Math.max(heard - playing.startedAt, 0);
  };

  const stop = (): void => {
    if (!playing) return;
    playing.node.stop();
    playing = null;
  };

  const start = async (readTime: () => number): Promise<void> => {
    // Created within the click, which is what lets it sound.
    context ??= new AudioContext();
    song ??= fetch(SONG_URL)
      .then((response) => {
        if (!response.ok) throw new Error(`Could not load ${SONG_URL}: ${response.status}`);
        return response.arrayBuffer();
      })
      .then((data) => context!.decodeAudioData(data));
    const buffer = await song.catch((error: unknown) => {
      song = null;
      throw error;
    });
    await context.resume();
    const node = context.createBufferSource();
    node.buffer = buffer;
    node.loop = true;
    // Exactly the loop, whatever padding the decoder left at the end.
    node.loopEnd = LOOP_SECONDS;
    node.connect(context.destination);
    // Loading and resuming may take time while the picture keeps advancing.
    const from = readTime();
    const offset = ((from % LOOP_SECONDS) + LOOP_SECONDS) % LOOP_SECONDS;
    node.start(0, offset);
    // Keeps the time unwrapped, so it never runs backwards at the switch.
    playing = { context, node, from, startedAt: context.currentTime };
  };

  return {
    clock: () => (playing ? time : null),
    async toggle(startFrom) {
      if (playing) {
        stop();
        return false;
      }
      await start(startFrom);
      return true;
    }
  };
};
