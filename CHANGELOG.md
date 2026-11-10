# Changelog

## Unreleased

No registry package, release tag or stable release has been published. The working package version remains `0.0.0` and `private: true` until the separate first-release step is approved.

### Added

- Markdown metadata validation, offline preview, capability planning and structured JSON results.
- Platform adapters for Velog, Tistory, KeyFlow and Google Blogger, with explicit account/blog destinations and source preservation.
- Common multi-target publish preflight, partial results and article concurrency locks. Unknown writes retain per-platform retry protection.
- Installation, login, FAQ, support, contribution and security guidance; package and clean-install verification tooling.

### Fixed

- Manual authentication uses ordinary Chrome with isolated Postrail profiles; Tistory restores normal session cookies across restart.
- Blogger administrator-list parsing supports the actual user-info envelope and rejects invalid memberships.
- Tistory readback supports current and legacy literal configuration shapes, preserves editor options and normalizes numeric image-dimension serialization.

### Verification and limitations

Scoped per-adapter draft/private create/read/same-ID update/unchanged-skip checks passed. User cleanup of the Velog test was recorded separately. The shared multi-target check runs last in stage7 and is reported in [stage7 status](docs/stage7-status.md). Do not infer public-publishing, token-expiry, visual-rendering or cross-platform authentication coverage from those checks. KeyFlow acceptance remains closed with its existing limits.
