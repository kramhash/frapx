import { LOOP_SECONDS } from "./scene.glsl";

/** The song as delivered to the browser; audio/music.wav is the master. */
const SONG_URL = `${import.meta.env.BASE_URL}music.m4a`;

export type Soundtrack = {
  /**
   * The artwork's clock in seconds: the page's own while silent, the song's
   * playback position while it plays. Pass it as fx-passes' `timeSource`.
   */
  time(): number;
  /** Starts the song where the loop is, or silences it. Resolves to whether it plays. */
  toggle(): Promise<boolean>;
};

type Playing = { context: AudioContext; node: AudioBufferSourceNode; from: number; startedAt: number };

/**
 * The song joins the loop where the picture is and then leads it, so the
 * picture never jumps when the sound comes in or goes out.
 */
export const createSoundtrack = (): Soundtrack => {
  let context: AudioContext | null = null;
  let song: Promise<AudioBuffer> | null = null;
  let playing: Playing | null = null;
  // While silent: time = silentFrom + seconds since silentSince.
  let silentFrom = 0;
  let silentSince = performance.now();

  const time = (): number => {
    if (!playing) return silentFrom + (performance.now() - silentSince) / 1000;
    // What is heard now left the context outputLatency ago.
    const heard = playing.context.currentTime - (playing.context.outputLatency || 0);
    return playing.from + Math.max(heard - playing.startedAt, 0);
  };

  const stop = (): void => {
    if (!playing) return;
    silentFrom = time();
    silentSince = performance.now();
    playing.node.stop();
    playing = null;
  };

  const start = async (): Promise<void> => {
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
    const from = time();
    const node = context.createBufferSource();
    node.buffer = buffer;
    node.loop = true;
    // Exactly the loop, whatever padding the decoder left at the end.
    node.loopEnd = LOOP_SECONDS;
    node.connect(context.destination);
    const offset = ((from % LOOP_SECONDS) + LOOP_SECONDS) % LOOP_SECONDS;
    node.start(0, offset);
    // Keeps the time unwrapped, so it never runs backwards at the switch.
    playing = { context, node, from, startedAt: context.currentTime };
  };

  return {
    time,
    async toggle() {
      if (playing) {
        stop();
        return false;
      }
      await start();
      return true;
    }
  };
};
