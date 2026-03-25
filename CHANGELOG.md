# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Built-in `telegram-bridge` command for headless Telegram bridge entrypoint with shared approval persistence (#211)

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