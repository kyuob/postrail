# 설치와 첫 실행

현재 소스와 패키지의 버전은0.1.4다. [npm 패키지 페이지](https://www.npmjs.com/package/@kyuob/postrail)에서 공개된 버전을 확인한 뒤 다음처럼 설치한다. 공개 상태와 관리자 검수 절차는 [npm 안내](npm-publication.md)를 참고한다. 아래 GitHub 설치 예시는 v0.1.2를 기준으로 한다.0.1.4에서 추가된 기능은 기존0.1.3배포물에 소급 포함되지 않는다.

```sh
bun add -g @kyuob/postrail --ignore-scripts
postrail --version
postrail --help
```

[English quick start](../README.md) · [로그인](login.md) · [문제 해결](faq.md) · [지원 범위](support.md)

## 필요한 프로그램

- Node.js 22 이상. 로컬 검수는 실행 기록에 표시한 버전을 기준으로 한다.
- Bun 1.3 이상. 개발·설치·패키지 준비에 사용한다.
- Velog/Tistory 로그인에는 macOS와 Google Chrome이 필요하다. Playwright Core가 Chrome을 별도 다운로드하지 않는다.
- Git 소스 설치에는 Git이 필요하다. Blogger는 본인 소유 Desktop OAuth 클라이언트 설정도 필요하다.

오프라인 CLI와 실제 브라우저 인증의 지원 범위는 다르다. Linux/Windows에서 오프라인 검사가 실행된다고 Velog/Tistory 인증도 지원되는 것은 아니다. [지원표](support.md)를 먼저 확인한다.

## GitHub 릴리스로 설치

GitHub 설치 예시는 실험적 [v0.1.2 사전 릴리스](https://github.com/kyuob/postrail/releases/tag/v0.1.2)다. npm 배포와 버전이 다를 수 있으므로 다운로드한 파일의 버전을 확인한다. 다른 프로젝트가 쓰는 `postrail` 패키지를 이름만으로 설치하지 않는다. 패키지 이름은 `@kyuob/postrail`, 설치 후 명령은 `postrail`이다. 최초 v0.1.0의 증거는 [이전 릴리스 기록](release-0.1.0.md)에 보존한다.

릴리스에서 `kyuob-postrail-0.1.2.tgz`와 `SHA256SUMS`를 같은 폴더에 내려받아 체크섬을 확인한다. macOS는 `shasum -a 256 -c SHA256SUMS`, Linux는 `sha256sum -c SHA256SUMS`를 사용할 수 있다. 이후 해당 폴더에서 실행한다.

```sh
bun add -g ./kyuob-postrail-0.1.2.tgz --ignore-scripts
postrail --version
postrail --help
```

이 GitHub 파일로 설치했다면 `--version`은 `0.1.2`를 출력해야 한다. registry에서 설치했다면 npm 페이지의 실제 배포 버전과 대조한다.

## 소스에서 실행

소스 빌드는 npm 계정 없이 실행할 수 있다. registry 설치 시에도 다른 프로젝트의 unscoped `postrail`을 사용하지 않는다.

```sh
git clone https://github.com/kyuob/postrail.git
cd postrail
bun install --frozen-lockfile --ignore-scripts
bun run build
node dist/cli.js --version
node dist/cli.js --help
node dist/cli.js validate examples/blogger.md --json
node dist/cli.js preview examples/blogger.md --output first-preview.html
```

`first-preview.html`은 새 파일이어야 한다. 이미 있으면 다른 이름을 쓴다. 미리보기는 로그인하거나 글을 전송하지 않는다. 실제 소스 원고와 로컬 이미지는 변경하지 않는다.

모든 예제의 계정·블로그는 가짜 값이다. 실제 전송 전에 [로그인 가이드](login.md)에 따라 본인 계정을 연결한다.

## 프로젝트와 전송 대상 준비

새 작업 폴더를 만들고 그 폴더에서 시작한다. `init`은 설정만 만들며 원고나 대상 파일을 만들지 않는다. 먼저 텍스트 편집기로 아래 두 파일을 UTF-8로 저장한다. 로컬 이미지나 다른 파일이 필요 없는 연습용 초안이다.

`article.md`:

<!-- onboarding:article -->
```markdown
---
id: my-first-draft
title: 첫 오프라인 초안
tags: [개발, CLI]
visibility: draft
targets: [velog, blogger]
---

## 첫 초안

이 글은 로컬 검증과 미리보기 연습용입니다.
```

`my-destinations.json`:

<!-- onboarding:destinations -->
```json
{
  "version": 1,
  "destinations": {
    "velog": { "account": "YOUR_VELOG_USERNAME" },
    "blogger": { "account": "your-blogger-account", "blogId": "12345" }
  }
}
```

이 대상은 가짜 값이며 아래 dry-run에서만 사용한다. 실제 전송 전에는 본인 계정·블로그 ID로 바꾸고 [로그인](login.md)을 별도로 완료한다. 비밀번호·토큰·쿠키는 넣지 않는다. `--dry-run`은 실제 계정이나 권한을 확인하지 않는다.

전역 패키지 사용자는 다음 블록을 실행한다.

<!-- onboarding:commands -->
```sh
postrail --version
postrail init
postrail validate ./article.md --json
postrail preview ./article.md --output ./preview.html --json
postrail publish ./article.md --to velog,blogger --destinations ./my-destinations.json --dry-run --json
```

소스 사용자는 같은 작업 폴더에서 각 줄의 `postrail` 대신 `node "/절대경로/postrail/dist/cli.js"`를 쓴다. 예를 들어 체크아웃 경로를 본인 경로로 바꾼 뒤 다음처럼 실행한다. 작업 폴더는 원고와 이력이 있는 폴더로 유지하고, 명령 파일만 절대경로로 지정한다.

```sh
node "/절대경로/postrail/dist/cli.js" validate ./article.md --json
```

`init`은 기존 `postrail.json`을 덮어쓰지 않으며 `preview.html`도 새 파일이어야 한다. 위 명령은 인증하거나 글을 올리지 않는다. 개발자는 빌드 후 `node scripts/onboarding-smoke.mjs`로 위 파일 내용과 명령 순서를 격리된 빈 폴더에서 검사할 수 있다.

원고 ID는 처음 정한 뒤 유지한다. 공개 상태도 명시한다. Tistory의 임시저장은 지원하지 않으며, Blogger는 개별 비공개 글과 로컬 이미지 업로드를 지원하지 않는다. [공통 publish](publish.md)에서 호환되는 대상 조합을 확인한다.

## 로컬 패키지로 설치

이 방법은 공개 배포를 하지 않고 현재 체크아웃으로 만든 패키지를 설치한다.

```sh
bun pm pack --destination ./dist
# 위 명령이 출력한 실제 .tgz 파일명으로 바꾼다.
bun add -g ./dist/kyuob-postrail-0.1.0.tgz --ignore-scripts
postrail --version
postrail --help
```

`pack`은 prepack 빌드를 실행한다. Bun의 전역 bin 폴더가 PATH에 없으면 `postrail` 명령을 찾지 못한다. `bun pm bin -g`로 경로를 확인하고 해당 경로를 본인 셸의 PATH에 추가한다. Postrail이 셸 설정을 자동 수정하지는 않는다.

개발자는 `bun run check:package`로 패키지 파일 목록과 별도 소비자 폴더 설치를 검사할 수 있다. 이 검사는 인증하지 않고 원격 글을 쓰지 않지만, 공개 의존성을 다운로드할 수 있다. 레지스트리에 패키지를 발행하지 않는다.

## 업데이트와 제거

소스 설치는 본인 변경 사항을 먼저 보존한 뒤 저장소를 업데이트하고 `bun install --frozen-lockfile --ignore-scripts`, `bun run build`를 다시 실행한다. 버전과 변경 내용은 [변경 기록](../CHANGELOG.md)을 확인한다. 로컬 패키지 사용자는 검수한 새 tarball을 다시 설치한다.

전역 명령은 `bun remove -g @kyuob/postrail`로 제거할 수 있다. 이 작업은 원격 글을 삭제하거나 로컬 세션·전송 이력을 자동 정리하지 않는다. 프로젝트의 `.postrail/`은 원격 글ID와 불확실한 전송 상태를 담으므로 업데이트·이동 시 함께 보존한다. 프로젝트를 옮긴 뒤 이력이 없으면 새 글을 만들 위험이 있다.

참고: [Bun 설치·패키지 명령](https://bun.sh/docs/pm/cli/pm), [스크립트 실행 정책](https://bun.sh/docs/pm/lifecycle).
