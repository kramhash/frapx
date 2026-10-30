import { act, StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Particles, useParticles, type ParticlesHandle } from "../src";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

type MockInstance = ReturnType<typeof makeInstance>;

const makeInstance = (maxParticles: number) => ({
  canvas: null,
  gl: null,
  status: "running",
  supported: true,
  ready: Promise.resolve(),
  clock: "realtime",
  maxParticles,
  simulationRate: 60,
  start: vi.fn(),
  stop: vi.fn(),
  render: vi.fn(),
  resize: vi.fn(),
  destroy: vi.fn(),
  setTime: vi.fn(),
  setClock: vi.fn(),
  setTimeSource: vi.fn(),
  setResolution: vi.fn(),
  captureFrame: vi.fn(() => Promise.resolve(new Uint8Array(4))),
  reset: vi.fn(),
  setUniform: vi.fn(),
  setUniforms: vi.fn(),
  bindUniforms: vi.fn((_source: object) => vi.fn()),
  setColor: vi.fn(),
  setPalette: vi.fn(),
  setBlend: vi.fn()
});

const particlesMock = vi.hoisted(() => ({
  instances: [] as MockInstance[],
  // Pool the mocked runtime reports, like rate × longest lifetime × 1.25.
  pool: 1000,
  createParticles: vi.fn()
}));

vi.mock("@frapx/fx-particles", () => ({
  createParticles: particlesMock.createParticles,
  presets: { snow: { rate: 40, lifetime: [20, 24] } }
}));

const created = () => particlesMock.createParticles.mock.calls.length;
const latest = () => particlesMock.instances[particlesMock.instances.length - 1]!;
const lastOptions = () =>
  particlesMock.createParticles.mock.calls[created() - 1]![0] as Record<string, unknown> & {
    onError(error: Error): void;
    onReady(instance: unknown): void;
    onStatusChange(status: string): void;
  };

describe("Particles", () => {
  let container: HTMLDivElement;
  let root: Root;

  const render = async (element: React.ReactElement) => {
    await act(async () => {
      root.render(element);
    });
  };

  beforeEach(() => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    vi.clearAllMocks();
    particlesMock.instances.length = 0;
    particlesMock.pool = 1000;
    particlesMock.createParticles.mockImplementation(() => {
      const instance = makeInstance(particlesMock.pool);
      particlesMock.instances.push(instance);
      return instance;
    });
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it("creates an instance in the wrapper and destroys it on unmount", async () => {
    const onParticlesReady = vi.fn();
    await render(<Particles preset="snow" rate={10} onParticlesReady={onParticlesReady} />);

    expect(created()).toBe(1);
    expect(lastOptions()).toEqual(
      expect.objectContaining({ preset: "snow", rate: 10, target: expect.any(HTMLDivElement) })
    );
    expect(lastOptions()).not.toHaveProperty("onParticlesReady");
    expect(lastOptions()).not.toHaveProperty("uniformSources");

    lastOptions().onReady(latest());
    expect(onParticlesReady).toHaveBeenCalledWith(latest());

    const instance = latest();
    await act(async () => {
      root.unmount();
    });
    expect(instance.destroy).toHaveBeenCalledTimes(1);
  });

  it("keeps the instance for inline literals with the same values", async () => {
    const element = () => (
      <Particles
        preset="snow"
        lifetime={[2, 4]}
        emitter={{ area: [0, 0, 1, 1] }}
        forces={{ curl: { strength: 0.1 }, gravity: [0, -1, 0] }}
        color={[[0, "#fff"], [1, "#fff0"]]}
        palette={["#f00", "#0f0"]}
      />
    );
    await render(element());
    await render(element());

    const instance = latest();
    expect(created()).toBe(1);
    expect(instance.setUniforms).not.toHaveBeenCalled();
    expect(instance.setColor).not.toHaveBeenCalled();
    expect(instance.setPalette).not.toHaveBeenCalled();
  });

  it("applies uniform-backed values, color, palette and blend in place", async () => {
    await render(
      <Particles
        rate={10}
        opacity={1}
        forces={{ curl: { strength: 0.1 }, gravity: [0, -1, 0] }}
        color="#ffffff"
        palette={["#f00"]}
        blend="additive"
      />
    );
    await render(
      <Particles
        rate={20}
        opacity={0.5}
        forces={{ curl: { strength: 0.3, scale: 2 }, gravity: [0, -2, 0] }}
        color="#000000"
        palette={["#0f0"]}
        blend="normal"
      />
    );

    const instance = latest();
    expect(created()).toBe(1);
    expect(instance.setUniforms).toHaveBeenCalledWith({
      rate: 20,
      opacity: 0.5,
      gravity: [0, -2, 0],
      curlStrength: 0.3,
      curlScale: 2
    });
    expect(instance.setColor).toHaveBeenCalledWith("#000000");
    expect(instance.setPalette).toHaveBeenCalledWith(["#0f0"]);
    expect(instance.setBlend).toHaveBeenCalledWith("normal");
  });

  it("recreates for structural changes", async () => {
    await render(<Particles preset="snow" lifetime={[2, 4]} forces={{ drag: 1 }} />);
    await render(<Particles preset="snow" lifetime={[2, 5]} forces={{ drag: 1 }} />);
    expect(created()).toBe(2);

    // Adding a force changes which forces are simulated.
    await render(
      <Particles preset="snow" lifetime={[2, 5]} forces={{ drag: 1, curl: {} }} />
    );
    expect(created()).toBe(3);

    // Its values alone do not.
    await render(
      <Particles preset="snow" lifetime={[2, 5]} forces={{ drag: 2, curl: { speed: 1 } }} />
    );
    expect(created()).toBe(3);
    expect(latest().setUniforms).toHaveBeenCalledWith({ drag: 2, curlSpeed: 1 });

    await render(<Particles preset="dust" lifetime={[2, 5]} forces={{ drag: 2, curl: {} }} />);
    expect(created()).toBe(4);
    expect(particlesMock.instances[2]!.destroy).toHaveBeenCalledTimes(1);
  });

  it("recreates when a live value is dropped, and applies an added one in place", async () => {
    await render(<Particles preset="snow" />);
    await render(<Particles preset="snow" opacity={0.5} color="#fff" />);
    expect(created()).toBe(1);
    expect(latest().setUniforms).toHaveBeenCalledWith({ opacity: 0.5 });
    expect(latest().setColor).toHaveBeenCalledWith("#fff");

    await render(<Particles preset="snow" color="#fff" />);
    expect(created()).toBe(2);
    expect(lastOptions()).not.toHaveProperty("opacity");

    await render(<Particles preset="snow" />);
    expect(created()).toBe(3);
  });

  it("recreates when rate outgrows the automatic pool", async () => {
    // snow lives up to 24 s: a pool of 1000 holds rate 41 but not 42.
    await render(<Particles preset="snow" rate={40} />);
    await render(<Particles preset="snow" rate={41} />);
    expect(created()).toBe(1);

    await render(<Particles preset="snow" rate={42} />);
    expect(created()).toBe(2);
    expect(lastOptions()).toEqual(expect.objectContaining({ rate: 42 }));

    // A pool the caller chose is kept; fx-particles warns about the overflow.
    await render(<Particles preset="snow" rate={42} maxParticles={100} />);
    expect(created()).toBe(3);
    await render(<Particles preset="snow" rate={500} maxParticles={100} />);
    expect(created()).toBe(3);
    expect(latest().setUniforms).toHaveBeenCalledWith({ rate: 500 });
  });

  it("reports an invalid config and retries when a live value changes", async () => {
    const onParticlesError = vi.fn();
    const failure = new RangeError("rate must be a finite number >= 0, got -1");
    particlesMock.createParticles.mockImplementationOnce(() => {
      throw failure;
    });

    const Probe = ({ rate }: { rate: number }) => {
      const { ref, error, status } = useParticles({ rate, onParticlesError });
      return <div ref={ref} data-error={error?.message ?? ""} data-status={status} />;
    };
    const probe = () => container.querySelector("[data-status]")!;

    await render(<Probe rate={-1} />);
    expect(onParticlesError).toHaveBeenCalledWith(failure);
    expect(probe().getAttribute("data-status")).toBe("error");
    expect(probe().getAttribute("data-error")).toBe(failure.message);

    await render(<Probe rate={5} />);
    expect(created()).toBe(2);
    expect(probe().getAttribute("data-error")).toBe("");
    expect(probe().getAttribute("data-status")).toBe("running");
  });

  it("binds uniformSources in order and again on a recreated instance", async () => {
    const a = { get: () => ({ rate: 1 }) };
    const b = { get: () => ({ rate: 2 }) };

    await render(<Particles lifetime={[1, 2]} uniformSources={[a, b]} />);
    const first = latest();
    expect(first.bindUniforms.mock.calls.map(([source]) => source)).toEqual([a, b]);

    await render(<Particles lifetime={[1, 2]} uniformSources={[a, b]} />);
    expect(first.bindUniforms).toHaveBeenCalledTimes(2);

    await render(<Particles lifetime={[1, 3]} uniformSources={[a, b]} />);
    expect(created()).toBe(2);
    expect(latest().bindUniforms.mock.calls.map(([source]) => source)).toEqual([a, b]);

    const removers = latest().bindUniforms.mock.results.map((result) => result.value as () => void);
    await render(<Particles lifetime={[1, 3]} uniformSources={[b]} />);
    for (const remove of removers) expect(remove).toHaveBeenCalledTimes(1);
    expect(latest().bindUniforms).toHaveBeenLastCalledWith(b);
  });

  it("follows the latest timeSource without recreating", async () => {
    await act(async () => {
      root.render(<Particles timeSource={() => 1} />);
    });
    const source = lastOptions().timeSource as () => number;
    expect(source()).toBe(1);

    await act(async () => {
      root.render(<Particles timeSource={() => 2} />);
    });
    expect(source()).toBe(2);
    expect(created()).toBe(1);

    await act(async () => {
      root.render(<Particles />);
    });
    expect(latest().setTimeSource).toHaveBeenLastCalledWith(null);
    expect(created()).toBe(1);
  });

  it("switches clock and resolution in place", async () => {
    await render(<Particles resolution={[640, 360]} />);
    await render(<Particles resolution={[640, 360]} />);
    expect(latest().setResolution).not.toHaveBeenCalled();

    await render(<Particles clock="manual" resolution={[1920, 1080]} />);
    expect(created()).toBe(1);
    expect(latest().setClock).toHaveBeenLastCalledWith("manual");
    expect(latest().setResolution).toHaveBeenLastCalledWith([1920, 1080]);
  });

  it("forwards the imperative handle", async () => {
    const ref = { current: null as ParticlesHandle | null };
    const source = { get: () => ({ opacity: 1 }) };
    await render(<Particles ref={ref} />);

    ref.current?.setUniform("rate", 3);
    ref.current?.setColor("#123456");
    ref.current?.setPalette(null);
    ref.current?.setBlend("normal");
    ref.current?.reset();
    ref.current?.bindUniforms(source);
    await expect(ref.current?.captureFrame({ format: "rgba8" })).resolves.toEqual(new Uint8Array(4));

    const instance = latest();
    expect(ref.current?.getInstance()).toBe(instance);
    expect(instance.setUniform).toHaveBeenCalledWith("rate", 3);
    expect(instance.setColor).toHaveBeenCalledWith("#123456");
    expect(instance.setPalette).toHaveBeenCalledWith(null);
    expect(instance.setBlend).toHaveBeenCalledWith("normal");
    expect(instance.reset).toHaveBeenCalledTimes(1);
    expect(instance.bindUniforms).toHaveBeenCalledWith(source);
    expect(instance.captureFrame).toHaveBeenCalledWith({ format: "rgba8" });
  });

  it("keeps options off the wrapper div and passes DOM props through", async () => {
    await render(
      <Particles
        preset="snow"
        respectReducedMotion
        pauseWhenHidden={false}
        className="layer"
        data-testid="particles"
      />
    );

    const div = container.firstElementChild!;
    expect(div.getAttribute("class")).toBe("layer");
    expect(div.getAttribute("data-testid")).toBe("particles");
    expect(div.getAttribute("aria-hidden")).toBe("true");
    expect(div.hasAttribute("preset")).toBe(false);
    expect(div.hasAttribute("respectreducedmotion")).toBe(false);
    expect(lastOptions()).toEqual(
      expect.objectContaining({ respectReducedMotion: true, pauseWhenHidden: false })
    );
  });

  it("leaves one bound instance under StrictMode", async () => {
    const source = { get: () => ({ rate: 1 }) };
    await act(async () => {
      root.render(
        <StrictMode>
          <Particles preset="snow" uniformSources={[source]} />
        </StrictMode>
      );
    });

    const alive = particlesMock.instances.filter((instance) => instance.destroy.mock.calls.length === 0);
    expect(alive).toHaveLength(1);
    expect(alive[0]!.bindUniforms).toHaveBeenCalledTimes(1);
  });

  it("retries only the live value that threw and keeps the error until it applies", async () => {
    const Probe = (props: { color: string; palette: string[]; opacity: number }) => {
      const { ref, error } = useParticles(props);
      return <div ref={ref} data-error={error?.message ?? ""} />;
    };
    const shownError = () => container.querySelector("[data-error]")!.getAttribute("data-error");

    await render(<Probe color="#fff" palette={["#f00"]} opacity={1} />);
    const instance = latest();
    instance.setColor.mockImplementation((color: string) => {
      if (color === "bad") throw new RangeError("Invalid color: bad");
    });

    await render(<Probe color="bad" palette={["#0f0"]} opacity={1} />);
    // The palette after the failing color still applies.
    expect(instance.setPalette).toHaveBeenLastCalledWith(["#0f0"]);
    expect(shownError()).toBe("Invalid color: bad");

    // An unrelated change retries the color and keeps the error.
    await render(<Probe color="bad" palette={["#0f0"]} opacity={0.5} />);
    expect(instance.setColor).toHaveBeenCalledTimes(2);
    expect(shownError()).toBe("Invalid color: bad");

    await render(<Probe color="#000" palette={["#0f0"]} opacity={0.5} />);
    expect(instance.setColor).toHaveBeenLastCalledWith("#000");
    expect(instance.setPalette).toHaveBeenCalledTimes(1);
    expect(shownError()).toBe("");
    expect(created()).toBe(1);
  });

  it("does not retry a failed creation in the commit that made it", async () => {
    const onParticlesError = vi.fn();
    await render(<Particles lifetime={[1, 2]} rate={1} onParticlesError={onParticlesError} />);
    particlesMock.createParticles.mockImplementationOnce(() => {
      throw new RangeError("lifetime must be positive");
    });

    // A structural and a live change together: one creation, one error.
    await render(<Particles lifetime={[1, 3]} rate={2} onParticlesError={onParticlesError} />);
    expect(created()).toBe(2);
    expect(onParticlesError).toHaveBeenCalledTimes(1);

    await render(<Particles lifetime={[1, 3]} rate={3} onParticlesError={onParticlesError} />);
    expect(created()).toBe(3);
  });

  it("follows status through onStatusChange and chains the caller's callback", async () => {
    const seen: string[] = [];
    const onStatusChange = vi.fn();
    const Probe = () => {
      const { ref, status } = useParticles({ rate: 10, onStatusChange });
      seen.push(status);
      return <div ref={ref} />;
    };

    await render(<Probe />);
    const report = lastOptions().onStatusChange;

    await act(async () => report("paused"));
    expect(seen[seen.length - 1]).toBe("paused");
    await act(async () => report("context-lost"));
    expect(seen[seen.length - 1]).toBe("context-lost");
    expect(onStatusChange.mock.calls.flat()).toEqual(["paused", "context-lost"]);
  });

  it("keeps the new instance's status when the old one reports destroyed", async () => {
    const seen: string[] = [];
    const onStatusChange = vi.fn();
    const Probe = ({ lifetime }: { lifetime: [number, number] }) => {
      const { ref, status } = useParticles({ lifetime, onStatusChange });
      seen.push(status);
      return <div ref={ref} />;
    };

    await render(<Probe lifetime={[1, 2]} />);
    const first = lastOptions().onStatusChange;
    latest().destroy.mockImplementationOnce(() => first("destroyed"));
    await render(<Probe lifetime={[1, 3]} />);
    expect(created()).toBe(2);
    await act(async () => lastOptions().onStatusChange("running"));

    expect(seen[seen.length - 1]).toBe("running");
    // The caller still hears the old instance go.
    expect(onStatusChange.mock.calls.flat()).toEqual(["destroyed", "running"]);
  });

  it("calls the latest onStatusChange without recreating", async () => {
    const first = vi.fn();
    const second = vi.fn();

    await render(<Particles rate={10} onStatusChange={first} />);
    await render(<Particles rate={10} onStatusChange={second} />);
    await act(async () => lastOptions().onStatusChange("paused"));

    expect(created()).toBe(1);
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledWith("paused");
  });
});
