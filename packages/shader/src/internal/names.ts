export const toUniformName = (name: string): string =>
  name.startsWith("u_") ? name : `u_${name}`;

export const fromUniformName = (name: string): string =>
  name.startsWith("u_") ? name.slice(2) : name;
