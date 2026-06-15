# Changelog

## 0.3.0 - 2026-06-15

### Added

- Added `setTexture()` and `setTextures()` for runtime texture updates.

### Changed

- Preserved runtime texture updates across WebGL context restore.
- Rebound core draw state after render hooks to isolate user WebGL side effects.
