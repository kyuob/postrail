# Changelog

## Unreleased — v0.1.1 stability work

- Reject ASCII-case-colliding tags in Velog/Tistory offline checks and direct pushes before authentication, uploads or journal creation.
- Retain verified owned Velog post identities from incomplete mutation responses, including partial GraphQL errors; retain unknown status and block retries. Reject foreign owners and changed update IDs.
- Add sanitized local-state, saved-ID and next-action hints to common failed results without converting them to success or issuing remote requests. Accept valid Velog IDs beginning with `_` or `-` in common results.
- Make beginner onboarding self-contained and verify the exact documented offline flow in empty consumers. Align prerelease and remote-conflict documentation with actual limits.
- Scoped publishing regressions:193 passing. These changes are local and unreleased; package version remains0.1.0. No additional KeyFlow-specific checks or live publishing were performed.

## 0.1.0 — 2026-11-10

First experimental GitHub release, distributed as `kyuob-postrail-0.1.0.tgz` with SHA256 checksums. The package name is `@kyuob/postrail` and the command is `postrail`. npm publication is not part of this release; `private: true` prevents accidental registry publication. The unscoped npm name belongs to a different project.

### Added

- Markdown metadata validation, offline preview, capability planning and structured JSON results.
- Platform adapters for Velog, Tistory, KeyFlow and Google Blogger, with explicit account/blog destinations and source preservation.
- Common multi-target publish preflight, partial results and article concurrency locks. Unknown writes retain per-platform retry protection.
- Installation, login, FAQ, support, contribution and security guidance; package and clean-install verification tooling.

### Fixed

- Manual authentication uses ordinary Chrome with isolated Postrail profiles; Tistory restores normal session cookies across restart.
- Blogger administrator-list parsing supports the actual user-info envelope and rejects invalid memberships.
- Tistory readback supports current and legacy literal configuration shapes, preserves editor options and normalizes numeric image-dimension serialization.
- Intended tag verification accepts server-canonical ASCII casing while keeping exact remote conflict fingerprints and rejecting changed tag identities or duplicates.
- Tistory generated HTML preserves paragraph spacing and separates image captions, including when the skin resets paragraph margins. Earlier renderer journals update the same ID once after conflict checks.

### Verification and limitations

Scoped draft/private flows and subsequent public Velog/Tistory/Blogger saved-ID updates passed. The approved public article retained16 sections and12 images per language; desktop image rendering and six promotional-image clicks were observed.167 publishing regressions and all9jobs in the Node22/24/macOS/Linux/Windows CI passed before release preparation. See [stage7](docs/stage7-status.md), [public acceptance](docs/publication-fable52.md) and [release notes](docs/release-0.1.0.md). Mobile, allOS authentication, expired-token live recovery and live public-to-draft reversal remain outside that proof. KeyFlow acceptance remains closed.
