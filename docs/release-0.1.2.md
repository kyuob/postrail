# Postrail v0.1.2

Experimental GitHub prerelease · 2026-11-10

This release combines stability work with explicit Velog recovery, offline image-budget diagnostics and expanded installation/distribution verification. npm publication is excluded; the package remains `private:true`.

## Install

Download `kyuob-postrail-0.1.2.tgz` and `SHA256SUMS` from the [v0.1.2 release](https://github.com/kyuob/postrail/releases/tag/v0.1.2), verify the checksum, then follow the [installation guide](installation.md).

```sh
bun add -g ./kyuob-postrail-0.1.2.tgz --ignore-scripts
postrail --version
postrail --help
postrail images ./article.md --json
```

## Changes

- Reject conflicting tag identities before sending; preserve owned IDs from incomplete responses and explain unresolved outcomes without retrying writes.
- Add `velog inspect` and explicitly confirmed `velog reconcile`: verify source, owner, saved ID, body, image bytes and visibility; require a fresh review hash, lock and private backup. These commands never modify remote posts.
- Add [image inventory](images.md): file sizes, total bytes, excess amounts, duplicate source accounting and preparation guidance. Original images and limits are unchanged.
- Verify local installation plus isolated global installation, PATH discovery and removal. Add read-only release verification for tag commit, latest CI, prerelease metadata, package identity, file allowlist and downloaded checksums.

## Verification and limits

Scoped offline regressions, documentation and package checks must pass before release. The exact release commit must pass all nine CI jobs before publication. After publication, maintainers run:

```sh
node scripts/verify-release.mjs v0.1.2
```

The verifier writes ignored local evidence only. Optional second and third arguments bind the expected full commit SHA and locally tested archive. Without the archive argument, checksum consistency does not prove build provenance.

New recovery behavior is tested with synthetic sessions; existing user journals and live posts are unchanged. Image checks inspect size/signatures, not complete decoding. No new account/login/mobile evidence is claimed. Other adapters do not support reconciliation. Existing [platform limits](support.md) remain.

## 한국어 안내

태그 검사·실패 시 ID 보존·벨로그 이력 대조·이미지 용량 안내·설치 및 배포 검수를 묶은 사전 릴리스다. 이미지는 자동으로 변환하지 않는다. 실제 글 발행과 계정 인증은 오프라인 검수와 구분하며, npm에는 공개하지 않는다.
