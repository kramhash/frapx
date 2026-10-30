import { describe, expectTypeOf, it } from "vitest";
import type * as core from "@frapx/core";
import type * as fx from "../src";
import type * as color from "../src/color";

// fx-canvas declares its public types itself so that @frapx/core (0.x) cannot
// change them. These assertions fail typechecking when the two drift apart.
// Types that exist only in fx-canvas (FeedbackOptions, RenderState, ...) are
// not listed.

describe("public types match @frapx/core", () => {
  it("color", () => {
    expectTypeOf<fx.Rgb>().toEqualTypeOf<core.Rgb>();
    expectTypeOf<fx.Rgba>().toEqualTypeOf<core.Rgba>();
    expectTypeOf<color.Rgb>().toEqualTypeOf<core.Rgb>();
    expectTypeOf<color.Rgba>().toEqualTypeOf<core.Rgba>();
  });

  it("errors", () => {
    expectTypeOf<fx.ShaderErrorLine>().toEqualTypeOf<core.ShaderErrorLine>();
    expectTypeOf<fx.ShaderStage>().toEqualTypeOf<core.ShaderStage>();
    // The error classes are core's own, so their fields must accept ours.
    expectTypeOf<fx.ShaderCompileError["lines"]>().toEqualTypeOf<
      readonly fx.ShaderErrorLine[]
    >();
    expectTypeOf<fx.ShaderCompileError["stage"]>().toEqualTypeOf<fx.ShaderStage | null>();
  });

  it("runtime options", () => {
    expectTypeOf<fx.GLContext>().toEqualTypeOf<core.GLContext>();
    expectTypeOf<fx.ShaderLayer>().toEqualTypeOf<core.ShaderLayer>();
    expectTypeOf<fx.RenderMode>().toEqualTypeOf<core.RenderMode>();
    expectTypeOf<fx.ClockMode>().toEqualTypeOf<core.ClockMode>();
    expectTypeOf<fx.TimeSource>().toEqualTypeOf<core.TimeSource>();
    expectTypeOf<fx.Resolution>().toEqualTypeOf<core.Resolution>();
    expectTypeOf<fx.DprOption>().toEqualTypeOf<core.DprOption>();
    expectTypeOf<fx.ShaderStatus>().toEqualTypeOf<core.ShaderStatus>();
  });

  it("textures", () => {
    expectTypeOf<fx.TextureSource>().toEqualTypeOf<core.TextureSource>();
    expectTypeOf<fx.TextureOptions>().toEqualTypeOf<core.TextureOptions>();
    expectTypeOf<fx.TextureInput>().toEqualTypeOf<core.TextureInput>();
    expectTypeOf<fx.TextureMap>().toEqualTypeOf<core.TextureMap>();
  });

  it("capture", () => {
    expectTypeOf<fx.CaptureFormat>().toEqualTypeOf<core.CaptureFormat>();
    expectTypeOf<fx.CaptureOptions>().toEqualTypeOf<core.CaptureOptions>();
    expectTypeOf<fx.CaptureOptions<"rgba16f">>().toEqualTypeOf<
      core.CaptureOptions<"rgba16f">
    >();
    expectTypeOf<fx.CaptureResult<"png">>().toEqualTypeOf<core.CaptureResult<"png">>();
    expectTypeOf<fx.CaptureResult<"rgba8">>().toEqualTypeOf<core.CaptureResult<"rgba8">>();
    expectTypeOf<fx.CaptureResult<"rgba16f">>().toEqualTypeOf<
      core.CaptureResult<"rgba16f">
    >();
    expectTypeOf<fx.CaptureResult<fx.CaptureFormat>>().toEqualTypeOf<
      core.CaptureResult<core.CaptureFormat>
    >();
  });

  it("uniforms", () => {
    expectTypeOf<fx.UniformScalar>().toEqualTypeOf<core.UniformScalar>();
    expectTypeOf<fx.UniformVec2>().toEqualTypeOf<core.UniformVec2>();
    expectTypeOf<fx.UniformVec3>().toEqualTypeOf<core.UniformVec3>();
    expectTypeOf<fx.UniformVec4>().toEqualTypeOf<core.UniformVec4>();
    expectTypeOf<fx.UniformType>().toEqualTypeOf<core.UniformType>();
    expectTypeOf<fx.ExplicitUniformInput>().toEqualTypeOf<core.ExplicitUniformInput>();
    expectTypeOf<fx.UniformInput>().toEqualTypeOf<core.UniformInput>();
    expectTypeOf<fx.UniformInputMap>().toEqualTypeOf<core.UniformInputMap>();
    expectTypeOf<fx.UniformSource>().toEqualTypeOf<core.UniformSource>();
  });

  it("UniformRuntimeValue for each input shape", () => {
    expectTypeOf<fx.UniformRuntimeValue<number>>().toEqualTypeOf<
      core.UniformRuntimeValue<number>
    >();
    expectTypeOf<fx.UniformRuntimeValue<[number, number]>>().toEqualTypeOf<
      core.UniformRuntimeValue<[number, number]>
    >();
    expectTypeOf<fx.UniformRuntimeValue<readonly [number, number, number]>>().toEqualTypeOf<
      core.UniformRuntimeValue<readonly [number, number, number]>
    >();
    expectTypeOf<fx.UniformRuntimeValue<[number, number, number, number]>>().toEqualTypeOf<
      core.UniformRuntimeValue<[number, number, number, number]>
    >();
    expectTypeOf<fx.UniformRuntimeValue<Float32Array>>().toEqualTypeOf<
      core.UniformRuntimeValue<Float32Array>
    >();
    expectTypeOf<fx.UniformRuntimeValue<fx.ExplicitUniformInput>>().toEqualTypeOf<
      core.UniformRuntimeValue<core.ExplicitUniformInput>
    >();
    expectTypeOf<fx.UniformRuntimeValue<fx.UniformInput>>().toEqualTypeOf<
      core.UniformRuntimeValue<core.UniformInput>
    >();
  });

  it("keyframes", () => {
    expectTypeOf<fx.KeyframeValue>().toEqualTypeOf<core.KeyframeValue>();
    expectTypeOf<fx.Keyframe>().toEqualTypeOf<core.Keyframe>();
    expectTypeOf<fx.Ease>().toEqualTypeOf<core.Ease>();
    expectTypeOf<fx.KeyframeTrack>().toEqualTypeOf<core.KeyframeTrack>();
    expectTypeOf<fx.KeyframeOptions>().toEqualTypeOf<core.KeyframeOptions>();
    // keyframes() is core's own: our types must go in and come out of it.
    expectTypeOf<core.UniformSource>().toEqualTypeOf<ReturnType<typeof fx.keyframes>>();
    expectTypeOf<typeof fx.keyframes>()
      .parameter(1)
      .toEqualTypeOf<fx.KeyframeOptions | undefined>();
  });
});
