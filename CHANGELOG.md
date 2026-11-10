# Changelog

## Unreleased

- Share strict CLI option parsing while retaining each command's allowed options and validation order.
- Move platform text output to command-owned printers and keep the CLI entry point as a router.
- Register public adapter error identifiers explicitly; suppress unknown prefixed identifiers and check core error/exit documentation.
- Pin Prettier as a development dependency and check source formatting in CI. Runtime dependencies and publishing safeguards are unchanged.

## 0.1.4 — 2026-11-10

- Limit package documentation to an explicit user-guide allowlist. Keep internal review, stage and live-validation evidence in the repository; validate that shipped Markdown links resolve inside the archive or point to the repository.
- Add macOS Velog/Tistory `login --chrome-path` and `POSTRAIL_CHROME_PATH` for nonstandard Google Chrome installations. Use the same executable for manual login and subsequent profile verification; no shell execution, automatic authentication or credential export.
- Connect the common publish failure report to existing local status, including adapters with local-only inspection. Retain saved IDs, failed/unknown distinctions and no-retry behavior without extra remote calls.
- Correct publication documentation from official registry metadata. This patch does not alter the published0.1.3 archive or perform live blog writes. Exact release verification is recorded separately from source changes.

## 0.1.3 — npm distribution and expanded recovery

- Extend explicit inspect/reconcile to Tistory and Blogger: bind saved IDs, source targets, body, visibility and ownership; tag differences require separate acceptance. Preserve exact private backups and locks; never write remote posts or recreate missing IDs.
- Verify Tistory local-image CDN bytes after complete body reconstruction. Keep Blogger private/local images and Tistory draft slots unsupported.
- Preserve canonical approved-source hashes for unchanged skips after reconciliation; remote conflicts remain checked first.
- Published the public scoped npm package as `@kyuob/postrail@0.1.3`; the official registry records publication at2026-11-10T12:40:54.791Z and latest0.1.3. Explicit registry/access and private:false follow user approval. See the npm guide for read-only verification; later Unreleased changes are not part of that archive.
- Add registry readback/integrity verification, opt-in clean registry installation and dry-run publication checks. No real blog or user-journal recovery is performed.

## 0.1.2 — 2026-11-10

- Combine the stability and explicit Velog recovery changes below into an experimental GitHub prerelease; npm publication remains excluded.
- Add offline `images` inventory with file/total byte limits, exact excess amounts, source-reference counts and original-preserving preparation guidance. Limits and publishing hashes remain unchanged.
- Extend package checks to isolated global installation, PATH discovery and removal using an explicit Bun configuration. Verify downloaded release assets, checksums, package allowlist, exact tag commit and latest CI; optionally compare the locally tested archive byte-for-byte.
- New behavior is verified offline. No additional account authentication, blog publication or user-journal recovery is performed.

### Included Velog recovery

- Add read-only `velog inspect` and explicitly reviewed local `velog reconcile`, limited to owned saved pending/unknown IDs. Compare source, exact reconstructed Markdown, tags, both visibility flags and local CDN image bytes.
- Require a fresh source/journal/remote review hash, explicit tag-difference acceptance, journal lock and verified private byte-exact backup before local reconciliation. No remote publication writes, retries or abandoned-lock cleanup.
- Retain the original publication hash and a validated target-independent approved-source hash so a target-selection change does not rewrite an adopted post; exact remote conflicts still block subsequent skips.
- Recovery is not available in the v0.1.0 tarball, is not implemented for other adapters, and was tested with synthetic sessions only. Existing user journals and posts were not changed.
- Scoped regressions now total225, including review staleness, exact draft/private flags, CDN restrictions, journal backups and post-recovery conflict checks.

### Included stability work (original v0.1.1 target)

- Reject ASCII-case-colliding tags in Velog/Tistory offline checks and direct pushes before authentication, uploads or journal creation.
- Retain verified owned Velog post identities from incomplete mutation responses, including partial GraphQL errors; retain unknown status and block retries. Reject foreign owners and changed update IDs.
- Add sanitized local-state, saved-ID and next-action hints to common failed results without converting them to success or issuing remote requests. Accept valid Velog IDs beginning with `_` or `-` in common results.
- Make beginner onboarding self-contained and verify the exact documented offline flow in empty consumers. Align prerelease and remote-conflict documentation with actual limits.
- Original stability validation:193 scoped publishing regressions passed. The changes are included in0.1.2. No additional KeyFlow-specific checks or live publishing were performed.

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

Scoped draft/private flows and subsequent public Velog/Tistory/Blogger saved-ID updates passed. The approved public article retained16 sections and12 images per language; desktop image rendering and six promotional-image clicks were observed.167 publishing regressions and all9jobs in the Node22/24/macOS/Linux/Windows CI passed before release preparation. See [stage7](https://github.com/kyuob/postrail/blob/main/docs/stage7-status.md), [public acceptance](https://github.com/kyuob/postrail/blob/main/docs/publication-fable52.md) and [release notes](docs/release-0.1.0.md). Mobile, allOS authentication, expired-token live recovery and live public-to-draft reversal remain outside that proof. KeyFlow acceptance remains closed.
