# Changelog

Notable changes to this project are recorded here. This project follows Semantic Versioning.

## [0.5.0] - 2026-08-25

### Added

- Optional Composition API source contracts for `@kubohiroya/turbowarp-jsqr` and
  `@kubohiroya/turbowarp-webusb-pasori`.
- `waitForQrCandidate()` and `waitForNfcCandidate()` with AbortSignal support and latest-wins
  cancellation ownership.
- `cameraId` forwarding for QR waits and `readerId` forwarding for NFC waits, enabling separate
  camera roles and multiple named PaSoRi readers.

### Compatibility

- Standalone blocks and existing composition methods are unchanged.
- Consumers can roll back by pinning `@kubohiroya/turbowarp-async-input@0.4.0`.

## [0.4.0] - 2026-08-14

### Added

- Self-contained SVG block icon for identifying Async Input blocks in TurboWarp.

### Compatibility

- Block opcodes, feature flags, and runtime behavior are unchanged.
- Consumers can roll back by pinning `@kubohiroya/turbowarp-async-input@0.3.0`.

## [0.3.0] - 2026-08-06

### Added

- Side-effect-free Composition API for accumulated-pose candidate waits.
- Key and topmost actor-touch candidate waits with latest-wins cancellation.
- Self-contained type declarations and a typed consumer verification fixture.

### Fixed

- Distribution verification now works in npm package staging directories without Git metadata.

### Compatibility

- Standalone blocks and opcodes are unchanged.
- The optional `poseInput` feature flag remains OFF by default.
- Consumers can roll back by pinning `@kubohiroya/turbowarp-async-input@0.2.0`.

## [0.2.0] - 2026-08-03

### Added

- Bilingual GitHub Pages user guide.
- Versioned npm and CDN installation guidance.

[0.5.0]: https://github.com/kubohiroya/turbowarp-async-input/releases/tag/v0.5.0
[0.4.0]: https://github.com/kubohiroya/turbowarp-async-input/releases/tag/v0.4.0
[0.3.0]: https://github.com/kubohiroya/turbowarp-async-input/releases/tag/v0.3.0
[0.2.0]: https://github.com/kubohiroya/turbowarp-async-input/releases/tag/v0.2.0
