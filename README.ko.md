# Postrail

Markdown 하나를 Velog·Tistory·KeyFlow·Google Blogger로 보내는 오픈소스 CLI입니다.

**현재는 첫 공개 패키지 릴리스 전입니다.** 플랫폼별 초안·비공개 생성·같은 ID 수정·조회 검증을 마쳤으며, 기능별 제약을 유지합니다. 공개 발행·이미지와 서식의 육안 확인·모든 OS 인증을 검증했다는 뜻은 아닙니다. [지원표](docs/support.md)와 [7단계 기록](docs/stage7-status.md)을 확인해 주세요.

[English README](README.md) · [설치](docs/installation.md) · [로그인](docs/login.md) · [FAQ](docs/faq.md)

## 빠른 시작

Node.js 22+, Bun 1.3+가 필요합니다. Velog/Tistory 로그인은 macOS의 일반 Google Chrome을 사용합니다.

```sh
git clone https://github.com/kyuob/postrail.git
cd postrail
bun install --frozen-lockfile --ignore-scripts
bun run build
node dist/cli.js --help
node dist/cli.js validate examples/blogger.md --json
node dist/cli.js preview examples/blogger.md --output first-preview.html
```

위 명령은 글을 올리지 않습니다. 아직 레지스트리 이름으로 설치하는 명령은 제공하지 않습니다. 로컬 tarball 설치·업데이트·제거는 [설치 가이드](docs/installation.md)를 따릅니다.

## 로그인

- [Velog](docs/velog.md): URL의 정확한 사용자명으로 연결합니다.
- [Tistory](docs/tistory.md): 본인 블로그의 서브도메인과 숫자 blogId를 사용합니다.
- [Blogger](docs/blogger.md): 본인 Desktop OAuth 클라이언트와 ADMIN 블로그를 연결합니다.
- [KeyFlow](docs/keyflow.md): 기존 공식 CLI의 명시적 계정을 사용합니다.

Velog/Tistory는 전용 Chrome에서 로그인한 뒤 **그 앱을 ⌘Q로 종료**해야 CLI가 저장된 계정을 확인합니다. Tistory는 카카오 로그인 뒤 본인 블로그 관리 화면까지 들어가야 합니다. 자세한 순서는 [통합 로그인 가이드](docs/login.md)를 확인하세요. 비밀번호·쿠키·토큰을 대상 파일이나 이슈에 넣지 마세요.

## 여러 플랫폼으로 보내기

[대상 예제](examples/destinations.json)를 복사해 본인 계정·블로그 ID로 바꿉니다. 원고의 공개 상태를 확인한 뒤 호환되는 플랫폼을 선택합니다.

```sh
node dist/cli.js publish ./article.md --to velog,blogger \
  --destinations ./my-destinations.json --dry-run --json

# 위 결과와 원고·계정·공개 상태를 검토한 뒤에만 실제 전송:
node dist/cli.js publish ./article.md --to velog,blogger \
  --destinations ./my-destinations.json --confirm --json
```

Tistory 임시저장, Blogger 개별 private 글·로컬 이미지 업로드는 미지원입니다. 서로 다른 비공개 상태를 자동 변환하지 않습니다. 모든 사전 검사가 통과한 뒤 순서대로 전송하며 일부 실패해도 성공 결과를 유지합니다. 불확실한 전송·원격 충돌은 자동 재시도하지 않습니다. KeyFlow의 원격 수동 수정 충돌 검출은 미구현이므로 해당 플랫폼 업데이트 전에는 원격 내용을 직접 확인해야 합니다.

## 문서와 참여

- [공통 전송과 복구](docs/publish.md), [원고 형식·오프라인 CLI](docs/offline-cli.md)
- [실계정 검증 결과](docs/bundled-validation-results.md), [로드맵](docs/roadmap.md)
- [기여 방법](CONTRIBUTING.md), [보안 제보](SECURITY.md), [변경 기록](CHANGELOG.md)

라이선스는 [MIT](LICENSE)이며 [외부 의존성 고지](docs/third-party-notices.md)를 함께 제공합니다. 패키지 공개와 릴리스는 별도 단계입니다.
