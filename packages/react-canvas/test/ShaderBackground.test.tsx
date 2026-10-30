import { act, StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ShaderBackground, useShaderBackground, type ShaderBackgroundHandle } from "../src";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

const shaderMock = vi.hoisted(() => {
  const instance = {
    canvas: null,
    gl: null,
    status: "running",
    supported: true,
    ready: Promise.resolve(),
    start: vi.fn(),
    stop: vi.fn(),
    render: vi.fn(),
    resize: vi.fn(),
    destroy: vi.fn(),
    setTexture: vi.fn(() => Promise.resolve()),
    setTextures: vi.fn(() => Promise.resolve()),
    setUniform: vi.fn(),
    setUniforms: vi.fn(),
    setTime: vi.fn(),
    setClock: vi.fn(),
    setTimeSource: vi.fn(),
    setResolution: vi.fn(),
    captureFrame: vi.fn(() => Promise.resolve(new Uint8Array(4))),
    resetFeedback: vi.fn(),
    setFragment: vi.fn((): Error | null => null),
    bindUniforms: vi.fn((source: { get(time: number): object }) => {
      const remove = vi.fn();
      shaderMock.removers.set(source, remove);
      return remove;
    })
  };

  return {
    instance,
    removers: new Map<object, ReturnType<typeof vi.fn>>(),
    createShaderBackground: vi.fn(() => instance)
  };
});

vi.mock("@frapx/fx-canvas", () => ({
  createShaderBackground: shaderMock.createShaderBackground
}));

describe("ShaderBackground", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    vi.clearAllMocks();
    shaderMock.removers.clear();
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it("creates and destroys a shader instance", async () => {
    await act(async () => {
      root.render(<ShaderBackground fragment="void main() {}" />);
    });

    expect(shaderMock.createShaderBackground).toHaveBeenCalledTimes(1);
    expect(shaderMock.createShaderBackground).toHaveBeenCalledWith(
      expect.objectContaining({
        fragment: "void main() {}",
        target: expect.any(HTMLDivElement)
      })
    );

    await act(async () => {
      root.unmount();
    });

    expect(shaderMock.instance.destroy).toHaveBeenCalledTimes(1);
  });

  it("updates uniforms and textures on the existing instance", async () => {
    const uniforms = { intensity: 0.4 };
    const nextUniforms = { intensity: 0.8 };
    const textures = { image: "/image-a.webp" };
    const nextTextures = { image: "/image-b.webp" };

    await act(async () => {
      root.render(
        <ShaderBackground
          fragment="void main() {}"
          uniforms={uniforms}
          textures={textures}
        />
      );
    });

    await act(async () => {
      root.render(
        <ShaderBackground
          fragment="void main() {}"
          uniforms={nextUniforms}
          textures={nextTextures}
        />
      );
    });

    expect(shaderMock.createShaderBackground).toHaveBeenCalledTimes(1);
    expect(shaderMock.instance.setUniforms).toHaveBeenCalledWith(nextUniforms);
    expect(shaderMock.instance.setTextures).toHaveBeenCalledWith(nextTextures);
  });

  it("passes feedback options to the core instance", async () => {
    await act(async () => {
      root.render(
        <ShaderBackground
          fragment="void main() {}"
          feedback={{ clearColor: [0, 0, 0, 0] }}
        />
      );
    });

    expect(shaderMock.createShaderBackground).toHaveBeenCalledWith(
      expect.objectContaining({
        feedback: { clearColor: [0, 0, 0, 0] }
      })
    );
  });

  it("exposes an imperative handle", async () => {
    const ref = { current: null as ShaderBackgroundHandle | null };

    await act(async () => {
      root.render(<ShaderBackground ref={ref} fragment="void main() {}" />);
    });

    ref.current?.stop();
    ref.current?.setUniform("intensity", 1);

    expect(shaderMock.instance.stop).toHaveBeenCalledTimes(1);
    expect(shaderMock.instance.setUniform).toHaveBeenCalledWith("intensity", 1);
  });

  it("forwards respectReducedMotion and pauseWhenHidden to core without DOM leakage (B1 regression)", async () => {
    await act(async () => {
      root.render(
        <ShaderBackground
          fragment="void main() {}"
          respectReducedMotion
          pauseWhenHidden={false}
        />
      );
    });

    expect(shaderMock.createShaderBackground).toHaveBeenCalledWith(
      expect.objectContaining({
        respectReducedMotion: true,
        pauseWhenHidden: false
      })
    );

    const div = container.firstElementChild!;
    expect(div.hasAttribute("respectReducedMotion")).toBe(false);
    expect(div.hasAttribute("respectreducedmotion")).toBe(false);
    expect(div.hasAttribute("pauseWhenHidden")).toBe(false);
    expect(div.hasAttribute("pausewhenhidden")).toBe(false);
  });

  it("exposes setTextures and setUniforms on the imperative handle (B2 regression)", async () => {
    const ref = { current: null as ShaderBackgroundHandle | null };

    await act(async () => {
      root.render(<ShaderBackground ref={ref} fragment="void main() {}" />);
    });

    const textures = { img: "/photo.webp" };
    const uniforms = { speed: 0.5 };

    ref.current?.setTextures(textures);
    ref.current?.setUniforms(uniforms);

    expect(shaderMock.instance.setTextures).toHaveBeenCalledWith(textures);
    expect(shaderMock.instance.setUniforms).toHaveBeenCalledWith(uniforms);
  });

  it("recreates the instance when a static option changes", async () => {
    await act(async () => {
      root.render(
        <ShaderBackground fragment="void main() {}" respectReducedMotion={false} />
      );
    });

    expect(shaderMock.createShaderBackground).toHaveBeenCalledTimes(1);

    await act(async () => {
      root.render(
        <ShaderBackground fragment="void main() {}" respectReducedMotion={true} />
      );
    });

    expect(shaderMock.createShaderBackground).toHaveBeenCalledTimes(2);
    expect(shaderMock.instance.destroy).toHaveBeenCalledTimes(1);
  });

  it("switches clock and resolution in place without recreating", async () => {
    await act(async () => {
      root.render(
        <ShaderBackground fragment="void main() {}" resolution={[640, 360]} />
      );
    });

    expect(shaderMock.createShaderBackground).toHaveBeenCalledWith(
      expect.objectContaining({ resolution: [640, 360] })
    );

    // A new array literal with the same values must not re-apply.
    await act(async () => {
      root.render(
        <ShaderBackground fragment="void main() {}" resolution={[640, 360]} />
      );
    });
    expect(shaderMock.instance.setResolution).not.toHaveBeenCalled();

    await act(async () => {
      root.render(
        <ShaderBackground
          fragment="void main() {}"
          clock="manual"
          resolution={[1920, 1080]}
        />
      );
    });

    expect(shaderMock.createShaderBackground).toHaveBeenCalledTimes(1);
    expect(shaderMock.instance.setClock).toHaveBeenLastCalledWith("manual");
    expect(shaderMock.instance.setResolution).toHaveBeenLastCalledWith([1920, 1080]);

    await act(async () => {
      root.render(<ShaderBackground fragment="void main() {}" />);
    });

    expect(shaderMock.instance.setClock).toHaveBeenLastCalledWith("realtime");
    expect(shaderMock.instance.setResolution).toHaveBeenLastCalledWith(null);
    expect(shaderMock.createShaderBackground).toHaveBeenCalledTimes(1);
  });

  it("follows the latest timeSource without recreating or resetting it", async () => {
    await act(async () => {
      root.render(<ShaderBackground fragment="void main() {}" timeSource={() => 1} />);
    });

    const [options] = shaderMock.createShaderBackground.mock.calls[0] as unknown as [
      { timeSource: () => number }
    ];
    expect(options.timeSource()).toBe(1);
    const calls = shaderMock.instance.setTimeSource.mock.calls.length;

    // A new inline function is read through the same wrapper.
    await act(async () => {
      root.render(<ShaderBackground fragment="void main() {}" timeSource={() => 2} />);
    });
    expect(options.timeSource()).toBe(2);
    expect(shaderMock.instance.setTimeSource).toHaveBeenCalledTimes(calls);

    await act(async () => {
      root.render(<ShaderBackground fragment="void main() {}" />);
    });
    expect(shaderMock.instance.setTimeSource).toHaveBeenLastCalledWith(null);
    expect(shaderMock.createShaderBackground).toHaveBeenCalledTimes(1);
  });

  it("swaps a new fragment in place and reports a compile error", async () => {
    const onShaderError = vi.fn();
    await act(async () => {
      root.render(<ShaderBackground fragment="void main() {}" onShaderError={onShaderError} />);
    });
    expect(shaderMock.instance.setFragment).not.toHaveBeenCalled();

    await act(async () => {
      root.render(<ShaderBackground fragment="void main() { }" onShaderError={onShaderError} />);
    });
    expect(shaderMock.instance.setFragment).toHaveBeenCalledWith("void main() { }");
    expect(shaderMock.createShaderBackground).toHaveBeenCalledTimes(1);
    expect(shaderMock.instance.destroy).not.toHaveBeenCalled();

    // The instance reports its compile error through onError, as the runtime does.
    const [options] = shaderMock.createShaderBackground.mock.calls[0] as unknown as [
      { onError(error: Error): void }
    ];
    const failure = new Error("ERROR: 0:1: 'x' : undeclared identifier");
    shaderMock.instance.setFragment.mockImplementationOnce(() => {
      options.onError(failure);
      return failure;
    });
    await act(async () => {
      root.render(<ShaderBackground fragment="void main() { x; }" onShaderError={onShaderError} />);
    });
    expect(onShaderError).toHaveBeenCalledWith(failure);
    expect(shaderMock.createShaderBackground).toHaveBeenCalledTimes(1);
  });

  it("keeps an unsupported or lost-context error when a swap is only deferred", async () => {
    const Probe = ({ fragment }: { fragment: string }) => {
      const { ref, error } = useShaderBackground({ fragment });
      return <div ref={ref} data-error={error?.message ?? ""} />;
    };
    const shownError = () => container.querySelector("[data-error]")!.getAttribute("data-error");

    await act(async () => {
      root.render(<Probe fragment="a" />);
    });
    const [options] = shaderMock.createShaderBackground.mock.calls[0] as unknown as [
      { onError(error: Error): void }
    ];
    shaderMock.instance.status = "context-lost";
    await act(async () => {
      options.onError(new Error("WebGL context lost."));
    });
    expect(shownError()).toBe("WebGL context lost.");

    // Deferred until the context returns: setFragment() returns null without swapping.
    await act(async () => {
      root.render(<Probe fragment="b" />);
    });
    expect(shaderMock.instance.setFragment).toHaveBeenCalledWith("b");
    expect(shownError()).toBe("WebGL context lost.");

    // A swap on a working instance clears it.
    shaderMock.instance.status = "running";
    await act(async () => {
      root.render(<Probe fragment="c" />);
    });
    expect(shownError()).toBe("");
  });

  it("recreates an instance whose first shader failed when the fragment changes", async () => {
    await act(async () => {
      root.render(<ShaderBackground fragment="broken" />);
    });
    shaderMock.instance.status = "error";

    await act(async () => {
      root.render(<ShaderBackground fragment="void main() {}" />);
    });
    shaderMock.instance.status = "running";

    expect(shaderMock.instance.setFragment).not.toHaveBeenCalled();
    expect(shaderMock.createShaderBackground).toHaveBeenCalledTimes(2);
    expect(shaderMock.createShaderBackground).toHaveBeenLastCalledWith(
      expect.objectContaining({ fragment: "void main() {}" })
    );
  });

  it("exposes clock and resolution controls on the imperative handle", async () => {
    const ref = { current: null as ShaderBackgroundHandle | null };

    await act(async () => {
      root.render(<ShaderBackground ref={ref} fragment="void main() {}" />);
    });

    ref.current?.setTime(1.5);
    ref.current?.setClock("manual");
    ref.current?.setResolution([800, 600]);

    expect(shaderMock.instance.setTime).toHaveBeenCalledWith(1.5);
    expect(shaderMock.instance.setClock).toHaveBeenCalledWith("manual");
    expect(shaderMock.instance.setResolution).toHaveBeenCalledWith([800, 600]);
  });

  it("forwards captureFrame and resetFeedback on the imperative handle", async () => {
    const ref = { current: null as ShaderBackgroundHandle | null };

    await act(async () => {
      root.render(<ShaderBackground ref={ref} fragment="void main() {}" />);
    });

    await expect(ref.current?.captureFrame({ format: "rgba8" })).resolves.toEqual(
      new Uint8Array(4)
    );
    ref.current?.resetFeedback();

    expect(shaderMock.instance.captureFrame).toHaveBeenCalledWith({ format: "rgba8" });
    expect(shaderMock.instance.resetFeedback).toHaveBeenCalledTimes(1);
  });

  it("binds uniformSources in order and rebinds only when the sources change", async () => {
    const a = { get: () => ({ glow: 1 }) };
    const b = { get: () => ({ glow: 2 }) };
    const bind = shaderMock.instance.bindUniforms;

    await act(async () => {
      root.render(<ShaderBackground fragment="void main() {}" uniformSources={[a, b]} />);
    });
    expect(bind.mock.calls.map(([source]) => source)).toEqual([a, b]);

    // A new array with the same sources does not rebind.
    await act(async () => {
      root.render(<ShaderBackground fragment="void main() {}" uniformSources={[a, b]} />);
    });
    expect(bind).toHaveBeenCalledTimes(2);

    // Reordering removes both and binds again in the new order.
    const firstRemovers = [shaderMock.removers.get(a), shaderMock.removers.get(b)];
    await act(async () => {
      root.render(<ShaderBackground fragment="void main() {}" uniformSources={[b, a]} />);
    });
    for (const remove of firstRemovers) expect(remove).toHaveBeenCalledTimes(1);
    expect(bind.mock.calls.slice(2).map(([source]) => source)).toEqual([b, a]);

    const secondRemovers = [shaderMock.removers.get(a), shaderMock.removers.get(b)];
    await act(async () => {
      root.render(<ShaderBackground fragment="void main() {}" />);
    });
    for (const remove of secondRemovers) expect(remove).toHaveBeenCalledTimes(1);
    expect(bind).toHaveBeenCalledTimes(4);
    expect(shaderMock.createShaderBackground).toHaveBeenCalledTimes(1);
  });

  it("binds uniformSources again on a recreated instance", async () => {
    const source = { get: () => ({ glow: 1 }) };

    await act(async () => {
      root.render(
        <ShaderBackground fragment="void main() {}" uniformSources={[source]} debug={false} />
      );
    });
    await act(async () => {
      root.render(
        <ShaderBackground fragment="void main() {}" uniformSources={[source]} debug />
      );
    });

    expect(shaderMock.createShaderBackground).toHaveBeenCalledTimes(2);
    expect(shaderMock.instance.bindUniforms).toHaveBeenCalledTimes(2);
    // The destroyed instance drops its bindings itself; nothing is removed by hand.
    expect(shaderMock.removers.get(source)).not.toHaveBeenCalled();
    expect(shaderMock.createShaderBackground).toHaveBeenLastCalledWith(
      expect.not.objectContaining({ uniformSources: expect.anything() })
    );
  });

  it("forwards bindUniforms on the imperative handle", async () => {
    const ref = { current: null as ShaderBackgroundHandle | null };
    const source = { get: () => ({ glow: 1 }) };

    await act(async () => {
      root.render(<ShaderBackground ref={ref} fragment="void main() {}" />);
    });

    const remove = ref.current?.bindUniforms(source);
    expect(shaderMock.instance.bindUniforms).toHaveBeenCalledWith(source);
    remove?.();
    expect(shaderMock.removers.get(source)).toHaveBeenCalledTimes(1);
  });

  it("binds uniformSources once on the surviving instance under StrictMode", async () => {
    const source = { get: () => ({ glow: 1 }) };

    await act(async () => {
      root.render(
        <StrictMode>
          <ShaderBackground fragment="void main() {}" uniformSources={[source]} />
        </StrictMode>
      );
    });

    const created = shaderMock.createShaderBackground.mock.calls.length;
    const destroyed = shaderMock.instance.destroy.mock.calls.length;
    // One binding per created instance; the discarded one is destroyed, not unbound.
    expect(created - destroyed).toBe(1);
    expect(shaderMock.instance.bindUniforms).toHaveBeenCalledTimes(created);
    expect(shaderMock.removers.get(source)).not.toHaveBeenCalled();
  });

  it("compares inline options that need a new instance by value", async () => {
    const render = (format: "rgba8" | "rgba16f", opacity: string) =>
      root.render(
        <ShaderBackground
          fragment="void main() {}"
          feedback={{ format }}
          canvasStyle={{ opacity }}
        />
      );

    await act(async () => render("rgba8", "0.5"));
    await act(async () => render("rgba8", "0.5"));
    expect(shaderMock.createShaderBackground).toHaveBeenCalledTimes(1);

    await act(async () => render("rgba16f", "0.5"));
    expect(shaderMock.createShaderBackground).toHaveBeenCalledTimes(2);

    await act(async () => render("rgba16f", "0.8"));
    expect(shaderMock.createShaderBackground).toHaveBeenCalledTimes(3);
  });

  it("recreates on an inline dpr function, which compares by reference", async () => {
    await act(async () => {
      root.render(<ShaderBackground fragment="void main() {}" dpr={() => 1} />);
    });
    await act(async () => {
      root.render(<ShaderBackground fragment="void main() {}" dpr={() => 1} />);
    });

    expect(shaderMock.createShaderBackground).toHaveBeenCalledTimes(2);
  });

  it("recreates from the hook on a changed value without recreateDeps", async () => {
    const Panel = ({ format }: { format: "rgba8" | "rgba16f" }) => {
      const { ref } = useShaderBackground({
        fragment: "void main() {}",
        feedback: { format }
      });
      return <div ref={ref} />;
    };

    await act(async () => root.render(<Panel format="rgba8" />));
    await act(async () => root.render(<Panel format="rgba8" />));
    expect(shaderMock.createShaderBackground).toHaveBeenCalledTimes(1);

    await act(async () => root.render(<Panel format="rgba16f" />));
    expect(shaderMock.createShaderBackground).toHaveBeenCalledTimes(2);
  });

  it("follows status through onStatusChange and chains the caller's callback", async () => {
    const seen: string[] = [];
    const onStatusChange = vi.fn();
    const Panel = () => {
      const { ref, status } = useShaderBackground({
        fragment: "void main() {}",
        onStatusChange
      });
      seen.push(status);
      return <div ref={ref} />;
    };

    await act(async () => root.render(<Panel />));
    const [options] = shaderMock.createShaderBackground.mock.calls[0] as unknown as [
      { onStatusChange: (status: string) => void }
    ];

    await act(async () => options.onStatusChange("paused"));
    expect(seen[seen.length - 1]).toBe("paused");
    await act(async () => options.onStatusChange("running"));
    expect(seen[seen.length - 1]).toBe("running");
    expect(onStatusChange.mock.calls.flat()).toEqual(["paused", "running"]);
  });

  it("forwards setTimeSource and setFragment on the imperative handle", async () => {
    const ref = { current: null as ShaderBackgroundHandle | null };
    const source = () => 2;

    await act(async () => {
      root.render(<ShaderBackground ref={ref} fragment="void main() {}" />);
    });

    ref.current?.setTimeSource(source);
    expect(shaderMock.instance.setTimeSource).toHaveBeenLastCalledWith(source);
    expect(ref.current?.setFragment("void main() { }")).toBeNull();
    const failure = new Error("compile failed");
    shaderMock.instance.setFragment.mockReturnValueOnce(failure);
    expect(ref.current?.setFragment("broken")).toBe(failure);
    expect(shaderMock.instance.setFragment).toHaveBeenCalledWith("void main() { }");
  });

  it("keeps the new instance's status when the old one reports destroyed", async () => {
    const seen: string[] = [];
    const Panel = ({ format }: { format: "rgba8" | "rgba16f" }) => {
      const { ref, status } = useShaderBackground({
        fragment: "void main() {}",
        feedback: { format }
      });
      seen.push(status);
      return <div ref={ref} />;
    };
    const statusOf = (call: number) =>
      (shaderMock.createShaderBackground.mock.calls[call] as unknown as [
        { onStatusChange: (status: string) => void }
      ])[0].onStatusChange;

    await act(async () => root.render(<Panel format="rgba8" />));
    const first = statusOf(0);
    shaderMock.instance.destroy.mockImplementationOnce(() => first("destroyed"));
    await act(async () => root.render(<Panel format="rgba16f" />));
    await act(async () => statusOf(1)("running"));

    expect(seen[seen.length - 1]).toBe("running");
  });

  it("calls the latest onShaderError, not the one from creation", async () => {
    const first = vi.fn();
    const second = vi.fn();

    await act(async () => {
      root.render(<ShaderBackground fragment="void main() {}" onShaderError={first} />);
    });
    await act(async () => {
      root.render(<ShaderBackground fragment="void main() {}" onShaderError={second} />);
    });
    const [options] = shaderMock.createShaderBackground.mock.calls[0] as unknown as [
      { onError: (error: Error) => void }
    ];
    await act(async () => options.onError(new Error("lost")));

    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });
});
