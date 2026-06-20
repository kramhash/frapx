import type {
  FeedbackOptions,
  GLContext,
  TextureOptions,
  UniformVec4
} from "../types";
import { ShaderCompileError, TextureLoadError } from "./errors";
import { toUniformName } from "./names";
import { createFullscreenBuffer, createProgram, isGLSL300 } from "./webgl";

export type NormalizedFeedbackOptions = {
  uniform: string;
  uniformName: string;
  sizeUniformName: string;
  filter: NonNullable<FeedbackOptions["filter"]>;
  wrap: NonNullable<FeedbackOptions["wrap"]>;
  clearColor: UniformVec4;
};

export type FeedbackTarget = {
  texture: WebGLTexture;
  framebuffer: WebGLFramebuffer;
  width: number;
  height: number;
};

export type FeedbackState = {
  options: NormalizedFeedbackOptions;
  read: FeedbackTarget;
  write: FeedbackTarget;
  copyProgram: WebGLProgram;
  copyBuffer: WebGLBuffer;
  copyAttribLocation: number;
  copySamplerLocation: WebGLUniformLocation | null;
  copyTextureUnit: number;
};

const DEFAULT_CLEAR_COLOR: UniformVec4 = [0, 0, 0, 0];
const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;

const copyFragment100 = `
precision highp float;

varying vec2 v_uv;
uniform sampler2D u_source;

void main() {
  gl_FragColor = texture2D(u_source, v_uv);
}
`;

const copyFragment300 = `#version 300 es
precision highp float;

in vec2 v_uv;
out vec4 fragColor;
uniform sampler2D u_source;

void main() {
  fragColor = texture(u_source, v_uv);
}
`;

export const normalizeFeedbackOptions = (
  input: boolean | FeedbackOptions | undefined
): NormalizedFeedbackOptions | null => {
  if (!input) return null;
  const options = input === true ? {} : input;
  const uniform = options.uniform ?? "previousFrame";

  if (uniform.startsWith("u_")) {
    throw new TextureLoadError(
      `Feedback uniform must be a suffix name without the u_ prefix: ${uniform}`
    );
  }

  if (!IDENTIFIER.test(uniform)) {
    throw new TextureLoadError(
      `Feedback uniform must be a valid GLSL identifier suffix: ${uniform}`
    );
  }

  return {
    uniform,
    uniformName: toUniformName(uniform),
    sizeUniformName: toUniformName(`${uniform}Size`),
    filter: options.filter ?? "linear",
    wrap: options.wrap ?? "clamp",
    clearColor: options.clearColor ?? DEFAULT_CLEAR_COLOR
  };
};

export const createFeedbackState = (
  gl: GLContext,
  options: NormalizedFeedbackOptions,
  width: number,
  height: number,
  copyTextureUnit: number,
  fragmentSource: string
): FeedbackState => {
  const is300 = isGLSL300(fragmentSource);
  const copyProgram = createProgram(
    gl,
    is300 ? copyVertex300 : copyVertex100,
    is300 ? copyFragment300 : copyFragment100
  );
  const copyBuffer = createFullscreenBuffer(gl, copyProgram);
  const copyAttribLocation = gl.getAttribLocation(copyProgram, "a_position");
  const copySamplerLocation = gl.getUniformLocation(copyProgram, "u_source");

  return {
    options,
    read: createFeedbackTarget(gl, options, width, height),
    write: createFeedbackTarget(gl, options, width, height),
    copyProgram,
    copyBuffer,
    copyAttribLocation,
    copySamplerLocation,
    copyTextureUnit
  };
};

export const resizeFeedbackState = (
  gl: GLContext,
  state: FeedbackState,
  width: number,
  height: number
): void => {
  if (state.read.width === width && state.read.height === height) return;
  deleteFeedbackTarget(gl, state.read);
  deleteFeedbackTarget(gl, state.write);
  state.read = createFeedbackTarget(gl, state.options, width, height);
  state.write = createFeedbackTarget(gl, state.options, width, height);
};

export const deleteFeedbackState = (
  gl: GLContext,
  state: FeedbackState | null
): void => {
  if (!state) return;
  deleteFeedbackTarget(gl, state.read);
  deleteFeedbackTarget(gl, state.write);
  gl.deleteBuffer(state.copyBuffer);
  gl.deleteProgram(state.copyProgram);
};

export const bindFeedbackForRead = (
  gl: GLContext,
  state: FeedbackState,
  samplerLocation: WebGLUniformLocation
): void => {
  gl.activeTexture(gl.TEXTURE0 + state.copyTextureUnit);
  gl.bindTexture(gl.TEXTURE_2D, state.read.texture);
  gl.uniform1i(samplerLocation, state.copyTextureUnit);
};

export const copyFeedbackToCanvas = (
  gl: GLContext,
  state: FeedbackState,
  width: number,
  height: number
): void => {
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.viewport(0, 0, width, height);
  gl.useProgram(state.copyProgram);
  gl.bindBuffer(gl.ARRAY_BUFFER, state.copyBuffer);
  if (state.copyAttribLocation >= 0) {
    gl.enableVertexAttribArray(state.copyAttribLocation);
    gl.vertexAttribPointer(state.copyAttribLocation, 2, gl.FLOAT, false, 0, 0);
  }
  if (state.copySamplerLocation) {
    gl.activeTexture(gl.TEXTURE0 + state.copyTextureUnit);
    gl.bindTexture(gl.TEXTURE_2D, state.write.texture);
    gl.uniform1i(state.copySamplerLocation, state.copyTextureUnit);
  }
  gl.drawArrays(gl.TRIANGLES, 0, 6);
};

export const swapFeedbackTargets = (state: FeedbackState): void => {
  const read = state.read;
  state.read = state.write;
  state.write = read;
};

const copyVertex100 = `
attribute vec2 a_position;
varying vec2 v_uv;

void main() {
  v_uv = a_position * 0.5 + 0.5;
  gl_Position = vec4(a_position, 0.0, 1.0);
}
`;

const copyVertex300 = `#version 300 es
in vec2 a_position;
out vec2 v_uv;

void main() {
  v_uv = a_position * 0.5 + 0.5;
  gl_Position = vec4(a_position, 0.0, 1.0);
}
`;

const createFeedbackTarget = (
  gl: GLContext,
  options: NormalizedFeedbackOptions,
  width: number,
  height: number
): FeedbackTarget => {
  const texture = gl.createTexture();
  if (!texture) {
    throw new ShaderCompileError("Failed to create feedback texture.");
  }

  const framebuffer = gl.createFramebuffer();
  if (!framebuffer) {
    gl.deleteTexture(texture);
    throw new ShaderCompileError("Failed to create feedback framebuffer.");
  }

  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texImage2D(
    gl.TEXTURE_2D,
    0,
    gl.RGBA,
    width,
    height,
    0,
    gl.RGBA,
    gl.UNSIGNED_BYTE,
    null
  );

  const wrap = getWrap(gl, options.wrap);
  const filter = getFilter(gl, options.filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrap);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);

  gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
  gl.framebufferTexture2D(
    gl.FRAMEBUFFER,
    gl.COLOR_ATTACHMENT0,
    gl.TEXTURE_2D,
    texture,
    0
  );

  const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
  if (status !== gl.FRAMEBUFFER_COMPLETE) {
    gl.deleteFramebuffer(framebuffer);
    gl.deleteTexture(texture);
    throw new ShaderCompileError(
      `Feedback framebuffer is incomplete: ${status}`
    );
  }

  gl.viewport(0, 0, width, height);
  gl.clearColor(
    options.clearColor[0],
    options.clearColor[1],
    options.clearColor[2],
    options.clearColor[3]
  );
  gl.clear(gl.COLOR_BUFFER_BIT);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);

  return { texture, framebuffer, width, height };
};

const deleteFeedbackTarget = (gl: GLContext, target: FeedbackTarget): void => {
  gl.deleteFramebuffer(target.framebuffer);
  gl.deleteTexture(target.texture);
};

const getWrap = (
  gl: GLContext,
  wrap: NonNullable<TextureOptions["wrap"]>
): number => {
  if (wrap === "repeat") return gl.REPEAT;
  if (wrap === "mirror") return gl.MIRRORED_REPEAT;
  return gl.CLAMP_TO_EDGE;
};

const getFilter = (
  gl: GLContext,
  filter: NonNullable<TextureOptions["filter"]>
): number => (filter === "nearest" ? gl.NEAREST : gl.LINEAR);
