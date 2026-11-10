# 설치와 첫 실행

[English quick start](../README.md) · [로그인](login.md) · [문제 해결](faq.md) · [지원 범위](support.md)

## 필요한 프로그램

- Node.js 22 이상. 로컬 검수는 실행 기록에 표시한 버전을 기준으로 한다.
- Bun 1.3 이상. 개발·설치·패키지 준비에 사용한다.
- Velog/Tistory 로그인에는 macOS와 Google Chrome이 필요하다. Playwright Core가 Chrome을 별도 다운로드하지 않는다.
- Git 소스 설치에는 Git이 필요하다. Blogger는 본인 소유 Desktop OAuth 클라이언트 설정도 필요하다.

오프라인 CLI와 실제 브라우저 인증의 지원 범위는 다르다. Linux/Windows에서 오프라인 검사가 실행된다고 Velog/Tistory 인증도 지원되는 것은 아니다. [지원표](support.md)를 먼저 확인한다.

## GitHub 릴리스로 설치

첫 배포는 [v0.1.0 GitHub Release](https://github.com/kyuob/postrail/releases/tag/v0.1.0)로 제공한다. npm에는 아직 공개하지 않았으며, 다른 프로젝트가 쓰는 `postrail` 패키지를 이름만으로 설치하지 않는다. 패키지 이름은 `@kyuob/postrail`, 설치 후 명령은 `postrail`이다.

릴리스에서 `kyuob-postrail-0.1.0.tgz`와 `SHA256SUMS`를 같은 폴더에 내려받아 체크섬을 확인한다. macOS는 `shasum -a 256 -c SHA256SUMS`, Linux는 `sha256sum -c SHA256SUMS`를 사용할 수 있다. 이후 해당 폴더에서 실행한다.

```sh
bun add -g ./kyuob-postrail-0.1.0.tgz --ignore-scripts
postrail --version
postrail --help
```

`--version`은 `0.1.0`을 출력해야 한다. npm명령으로 설치하는 경로는 별도 계정 인증·이름 소유권·공개 승인을 확인하기 전까지 제공하지 않는다.

## 소스에서 실행

현재 레지스트리에 공개한 패키지는 없다. `bun add -g postrail`처럼 이름만으로 설치하는 방법은 아직 안내하지 않는다.

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

작업할 폴더에서 실행한다. 아래 `postrail`은 패키지로 설치했을 때의 명령이며, 소스 사용자는 `node /절대경로/postrail/dist/cli.js`로 바꾼다.

```sh
postrail init
postrail validate ./article.md --json
postrail preview ./article.md --output ./preview.html
postrail publish ./article.md --to velog,blogger \
  --destinations ./my-destinations.json --dry-run --json
```

`init`은 기존 `postrail.json`을 덮어쓰지 않는다. [대상 설정 예제](../examples/destinations.json)를 복사하고 필요한 플랫폼의 사용자명·블로그 ID만 남긴다. 설정 파일에 비밀번호·토큰·쿠키를 넣지 않는다. `--dry-run`은 실제 계정을 확인하지 않는다.

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
