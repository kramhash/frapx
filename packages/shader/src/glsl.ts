export const glsl = (
  strings: TemplateStringsArray,
  ...values: unknown[]
): string => String.raw({ raw: strings }, ...values);

export const glslUtils = {
  coverUv: glsl`
vec2 coverUv(vec2 uv, vec2 viewportSize, vec2 textureSize) {
  vec2 ratio = vec2(
    min((viewportSize.x / viewportSize.y) / (textureSize.x / textureSize.y), 1.0),
    min((viewportSize.y / viewportSize.x) / (textureSize.y / textureSize.x), 1.0)
  );
  return uv * ratio + (1.0 - ratio) * 0.5;
}
`,
  containUv: glsl`
vec2 containUv(vec2 uv, vec2 viewportSize, vec2 textureSize) {
  vec2 ratio = vec2(
    max((viewportSize.x / viewportSize.y) / (textureSize.x / textureSize.y), 1.0),
    max((viewportSize.y / viewportSize.x) / (textureSize.y / textureSize.x), 1.0)
  );
  return uv * ratio + (1.0 - ratio) * 0.5;
}
`,
  rotate2d: glsl`
mat2 rotate2d(float angle) {
  float s = sin(angle);
  float c = cos(angle);
  return mat2(c, -s, s, c);
}
`
} as const;
