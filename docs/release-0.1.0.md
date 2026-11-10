# Postrail v0.1.0

Published experimental GitHub prerelease · 2026-11-10

These notes describe the historical v0.1.0 release. Later onboarding and stability documentation changes in the working tree are unreleased until a separate release is approved.

Postrail publishes Markdown to Velog, Tistory, KeyFlow and Google Blogger through a common CLI. It validates all selected targets before sending sequentially, preserves remote IDs and partial results, and stops unresolved writes instead of recreating posts.

## Install

Download `kyuob-postrail-0.1.0.tgz` and `SHA256SUMS` from the [v0.1.0 release](https://github.com/kyuob/postrail/releases/tag/v0.1.0). Verify the checksum and follow the [installation guide](installation.md). Requires Node22+ and Bun1.3+.

```sh
bun add -g ./kyuob-postrail-0.1.0.tgz --ignore-scripts
postrail --version
postrail --help
```

The package is named `@kyuob/postrail`; the executable remains `postrail`. This release is distributed on GitHub, not npm. `private:true` remains enabled until a separately authorized registry release. Do not install the unrelated unscoped npm package.

## Verified scope

- Offline validation, preview, planning and common publishing guards;167 scoped regression tests passed before release preparation.
- Real draft/private saved-ID create/update/readback/unchanged-skip flows for Velog/Tistory/Blogger, plus accepted existing KeyFlow integration.
- A user-approved public article on all three services:16 sections,10 original images plus2 clickable promotional banners, same-ID corrections and authenticated public readbacks. Native Chrome checks confirmed both banners and destinations; Tistory paragraph spacing was verified in the actual skin.
- Node22/24 offline CI on macOS/Linux/Windows; Linux clean-package checks on both versions. The verified pre-release implementation run is [42759941821](https://github.com/kyuob/postrail/actions/runs/42759941821). Release preparation is checked again at its exact commit before tagging.
- Packaged-file allowlist, no session/article-history files, a clean consumer installation, executable bin, external runtime dependencies and offline CLI checks.

## Known limits

Velog/Tistory use experimental internal interfaces and their interactive login currently supports macOS Chrome only. Tistory draft slots are unsupported. Blogger supports draft/public, not individual private posts or local-image upload; authenticated storage on Windows remains unsupported. KeyFlow lacks remote get/conflict detection. Automatic unknown recovery, deletion, scheduling and AI writing are out of scope.

The desktop checks do not prove mobile rendering, everyOS authentication, expired-token live renewal, or live public-to-draft reversal. See the [support matrix](support.md), [login guide](login.md) and [FAQ](faq.md) before use. GitHub CI never receives personal publishing credentials.

## 한국어 안내

GitHub에서 처음 배포하는 실험적 버전입니다. 패키지와 체크섬을 내려받아 설치하며 실행 명령은 `postrail`입니다. npm에는 아직 공개하지 않았습니다. 설치·로그인·FAQ문서와 실제 공개 발행 검수 결과를 함께 제공하며, 플랫폼별 미지원 기능은 그대로 유지합니다. 공개 글을 보내기 전에는 원고·계정·공개 상태와 `--dry-run`결과를 직접 확인해 주세요.
