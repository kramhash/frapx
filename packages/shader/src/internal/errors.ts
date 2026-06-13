export class ShaderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

export class UnsupportedError extends ShaderError {}
export class TargetNotFoundError extends ShaderError {}
export class ShaderCompileError extends ShaderError {}
export class TextureLoadError extends ShaderError {}
export class DestroyedError extends ShaderError {}
