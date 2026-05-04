# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Native Google Cloud Vertex AI support for Grok chat completions via `GROK_USE_VERTEX=1`, Application Default Credentials, and a Vertex payload/stream adapter.
- Vertex mode now forwards local CLI tools through sanitized Vertex function declarations, preserving directory/file/bash access while avoiding raw AI SDK schema fields that Vertex rejects.
- Vertex requests map native xAI model IDs such as `grok-4-1-fast-reasoning` to the corresponding Vertex publisher ID such as `grok-4.1-fast-reasoning`.
- Vertex ADC refresh failures such as Google `invalid_rapt` reauthentication errors now produce actionable `gcloud auth application-default` recovery guidance instead of raw auth JSON.
- Dedicated grep tool powered by npm ripgrep WASM (#263)
- `/btw` command for side questions (#264)

### Changed
- Switched Telegram voice/audio transcription from whisper.cpp to Grok STT (`/v1/stt`); removed `whisper-cli`, `ffmpeg`, and model-download requirements (#266, #265)
- Install script warns when auto-resolving to a pre-release version (#269)
- Release workflow publishes Sigstore build-provenance attestations (#271)

### Fixed
- RC version tags are published as GitHub prereleases (#268)

## [1.1.5-rc5] - 2026-04-15

### Fixed
- Pipe MCP stdio server stderr to prevent logs bleeding into TUI (#259)

## [1.1.5-rc4] - 2026-04-11

### Added
- Per-mode default models via `modeModels` in user settings (#258)

## [1.1.5-rc3] - 2026-04-09

### Added
- LSP support with server catalog and diagnostics (#255)

## [1.1.5-rc2] - 2026-04-07

### Added
- x402 payment protocol support via AgentKit (#252)
- Brin.sh security scanning for x402 payments (#253)

## [1.1.5-rc1] - 2026-04-05

### Added
- Programmable hooks system with 17 lifecycle events (#248)

## [1.1.4] - 2026-04-05

### Added
- Binary release workflow, install script, and self-management CLI commands (#241)
- Auto-open generated images and videos in the default OS viewer (#244)

### Changed
- Verify command (#240)

### Fixed
- Unbound `tmp_dir` variable error in install script (#242) (#243)

## [1.1.3] - 2026-04-01

### Added
- @-mention file autocomplete (#236)

## [1.1.2] - 2026-04-01

### Added
- Switch computer sub-agent to agent-desktop (#233)

### Removed
- Tracked telegram pair code from repo (#234)

## [1.1.1] - 2026-04-01

### Added
- Verify workflow with sandboxed testing and browser smoke checks (#228)
- Batch mode for headless Grok CLI runs (#231)

## [1.1.0] - 2026-03-26

### Added
- CLI update checker (#223)

### Changed
- Replace commit scan with PR security scan (#224)

### Fixed
- Issue with schedule modal (#226)

## [1.0.0-rc7] - 2026-03-26

### Added
- Scheduled headless runs with daemon and agent tools (#214)
- Shuru sandbox mode for agent shell execution (#215)
- Configurable sandbox settings (network, resources, ports, secrets) (#217)

## [1.0.0-rc6] - 2026-03-24

### Added
- Telegram file attachments — `telegram_send_file` tool for uploading media to Telegram chats (#212)
- Telegram voice/audio transcription via local whisper.cpp with auto model download and ffmpeg conversion (#210)
- Built-in Vision sub-agent for image validation through xAI Responses API (#209)
- Grok media tools (#207)
- Changelog (#206)

### Changed
- Updated app UI (#206)
- Clarify terminal support and unofficial status (#204)

### Fixed
- Mirror Telegram tool activity in TUI (#202)

## [1.0.0-rc5] - 2026-03-23

### Fixed
- Only send reasoningEffort for grok-3-mini (#200)

## [1.0.0-rc4] - 2026-03-23

### Added
- Support for multi-agent Grok models (#197)
- Custom sub-agents with /agents TUI and reliable interrupt (#192)
- Loading animation on streaming (#190)

### Changed
- Clarify headless json output format

## [1.0.0-rc3] - 2026-03-22

### Added
- JSON output mode for headless runs (#185)
- Test helper coverage for rewrite utilities (#184)
- Compaction (#183)
- Support for review command (#182)

### Fixed
- Use package.json version instead of hardcoded "1.0.0" (#188)

### Removed
- Grok.md support (#181)

## [1.0.0-rc2] - 2026-03-20

### Fixed
- Lint issues (#180)

### Changed
- Asset link in README.md
- Image source link in README.md (#179)
- Readme and version (#178)

## [1.0.0-rc1] - 2026-03-20

Initial release.
