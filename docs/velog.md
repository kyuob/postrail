# Velog adapter — experimental

## 검증 범위

2026-11-10 기준 v3 어댑터의 실제 Google 로그인·초안 생성·같은ID 수정·재조회·변경 없는 전송 건너뛰기를 확인했다. 사용자는 이후 테스트 초안을 직접 삭제했다. 이어 지정 원고의 비공개→공개 전환, 같은ID 수정과 이미지12개·추천 이미지2개의 실제 클릭을 macOS Chrome에서 확인했다. [초기 실검증](bundled-validation-results.md)과 [공개 글 검수](publication-fable52.md)를 구분하며, `liveVerified:false`를 모든 기능의 검증 주장으로 바꾸지 않는다. 공개된 안정적 외부 발행API계약은 아니므로 내부 인터페이스 변경에 영향을 받는다.

## 명령

개발 환경에서 `bun install --frozen-lockfile`과 `bun run build` 후 실행한다. Node.js 22+와 Google Chrome이 필요하다. Playwright Core는 외부 런타임 의존성으로 설치되며 별도 브라우저 다운로드를 실행하지 않는다.

```sh
node dist/cli.js velog check examples/velog.md --json
node dist/cli.js velog status examples/velog.md --account USERNAME --json
node dist/cli.js velog login --account USERNAME
node dist/cli.js velog push examples/velog.md --account USERNAME --confirm --json
node dist/cli.js velog get examples/velog.md --account USERNAME --json
```

`check`와 `status`는 인증·브라우저·네트워크 없이 실행한다. macOS의 `login`은 일반 Chrome을 Postrail 전용 프로필로 열며 로그인 중 자동화나 원격 디버깅을 연결하지 않는다. 사용자가 직접 로그인한 뒤 해당 Chrome 앱을 **⌘Q로 완전히 종료**하면, CLI가 같은 전용 프로필을 백그라운드에서 열어 현재 계정을 확인한다. 창만 닫으면 Chrome 프로세스가 남아 계속 기다릴 수 있다. 로그인 대기에는 시간 제한이 없다. 다른 운영체제의 수동 로그인은 아직 지원하지 않는다. 터미널이나 채팅에 비밀번호·토큰을 입력하지 않는다. 현재 벨로그 username이 `--account`와 일치해야 한다. macOS에서 Google 로그인과 이 종료 후 세션 보존을 확인했다.

`--diagnostics`는 수동 Chrome 종료 여부만 고정된 메시지로 표시한다. 로그인 브라우저의 네트워크·URL·헤더·쿠키·응답은 관찰하지 않는다. Chromium 샌드박스는 켜며, 백그라운드 계정 확인은 Chrome의 일반 OS 저장소를 사용한다. 운영체제의 Chrome 저장소 접근 확인이 표시되면 사용자가 직접 판단한다. 기존 Chrome 프로필 복사나 쿠키 추출은 하지 않는다.

`push`는 `--confirm` 없이는 전송하지 않는다. 원고의 `visibility`가 `draft`이면 `is_temp=true,is_private=true`, `private`이면 `false,true`, `public`이면 `false,false`를 보낸다. 기본값은 초안이다. 이 상태 변환과 실제 서비스 표시의 일치 여부는 실계정으로 확인해야 한다. 공개 원고에 대한 전송 승인은 별도로 받아야 한다.

같은 프로젝트·계정·원고 ID는 저장된 원격 ID로 수정한다. 원격 제목·본문·태그·상태·슬러그·썸네일·요약·시리즈가 마지막 저장 상태와 달라지면 덮어쓰지 않는다. 바뀌지 않은 원고도 원격 충돌 확인 후에만 건너뛴다. 기존 슬러그·썸네일·요약·시리즈를 유지한다. 삭제·원격 목록·기존 글 가져오기·자동 충돌 병합은 제공하지 않는다.

## 파일과 세션

세션은 사용자 홈의 `~/.postrail/velog-profiles/<계정 해시>/`에 보관하며 디렉터리는 0700으로 제한한다. Chromium이 저장하는 로컬 세션이므로 해당 사용자 계정과 디스크 보안에 의존한다. 기존 Chrome 프로필, 쿠키 DB, Keychain을 읽거나 복호화하지 않는다. 세션 경로를 공유·백업·Git 추가하지 않는다. 같은 계정의 Postrail Chrome 창을 동시에 열지 않는다.

원고별 기록은 프로젝트의 `.postrail/velog/<계정·원고 해시>/state.json`에 0600으로 원자적으로 저장한다. 게시글 ID와 해시만 남기며 쿠키·본문·토큰은 기록하지 않는다. `.postrail/`은 Git에서 제외한다. 기록을 잃거나 다른 프로젝트 폴더로 이동하면 기존 원격 ID를 찾지 못해 새 글이 생길 수 있으므로 기록도 안전하게 보존해야 한다.

로컬 이미지는 공통 검사에서 읽어둔 버퍼를 업로드한다. 원고 폴더 안의 PNG/JPEG/GIF/WebP만 허용하며 기존 파일 제한을 적용한다. Markdown AST의 이미지 위치를 사용해 전송 본문만 CDN URL로 바꾸고 원본 Markdown·이미지는 수정하지 않는다. 두 Markdown 파서가 이미지 구문에 동의하지 않으면 전송 전에 거절한다. 참조 이미지도 지원하며 코드블록 안의 예시는 바꾸지 않는다. 원격 이미지는 다시 업로드하지 않는다. 이미지 업로드 후 글 저장이 실패하면 서버에 미사용 이미지가 남을 수 있다.

## 불확실한 결과와 복구 한계

업로드 전에 `pending`을 저장하고 잠금을 잡는다. 이미지·글 쓰기·읽기 확인 중 실패하면 `unknown`을 남기며 자동 재생성을 막는다. 글 저장 응답의 ID는 읽기 확인 전에 보존한다. 네트워크 재시도, 리다이렉트, v2/v3 쓰기 규격 자동 전환은 하지 않는다. 정확히 한 번 전송을 보장하지 않는다.

`pending`, `unknown`, 남은 잠금은 원격 보관함에서 결과를 직접 확인해야 한다. ID가 있으면 `get`으로 읽을 수 있지만 자동 복구·승격 명령은 아직 없다. 결과를 확인하기 전 기록이나 잠금을 지우고 다시 전송하지 않는다. 원격 충돌도 사용자 판단으로 해결해야 하며 자동 덮어쓰기 옵션은 없다.

고정 v3 HTTPS 엔드포인트에만 인증 요청을 보낸다. 응답 본문·서버 오류·쿠키는 출력하지 않는다. 응답 파싱은 8 MiB까지 허용하지만 Playwright가 응답을 메모리에 받은 뒤 검사하는 한계가 있다. CDN 반환 URL은 HTTPS `velcdn.com` 또는 하위 도메인만 허용한다. 실제 계정 지원 OS와 인증 만료 복구는 미검증이다.

POSIX에서는 상태 파일과 디렉터리 이름 변경을 fsync한다. Windows에서는 디렉터리 fsync를 건너뛰므로 전원 장애 뒤 저널 보존을 보장하지 않는다. 원격 변경 확인과 실제 수정 사이에 다른 사용자가 수정하는 경합도 서버의 조건부 쓰기 기능 없이 완전히 막을 수 없다. 파일 잠금은 같은 로컬 원고·계정에만 적용된다.

## 근거와 검사

- [공식 v3 Post 스키마](https://github.com/velog-io/velog/blob/63dcace01e1c87b35a38027f681d9e7c0f210467/apps/server/src/graphql/Post.gql): input 객체, ID 읽기, 초안·비공개 필드.
- [공식 업로드 라우트](https://github.com/velog-io/velog/blob/63dcace01e1c87b35a38027f681d9e7c0f210467/apps/server/src/routes/files/v3/index.mts), [업로드 처리](https://github.com/velog-io/velog/blob/63dcace01e1c87b35a38027f681d9e7c0f210467/apps/server/src/routes/files/v3/filesController.mts): multipart `image`, `type=post`, 반환 `path`.
- [참고한 한국 개발자 프로젝트 2개](references.md): 읽기 전용으로 규격을 비교했으며 쿠키 추출 코드는 채택하지 않았다.
- [Playwright APIRequestContext](https://playwright.dev/docs/api/class-apirequestcontext): 브라우저 컨텍스트의 쿠키를 공유하고 Set-Cookie를 반영한다.

`bun run check:velog`는 공통 CLI와 Velog의 생성·수정·읽기 확인·충돌·unknown·이미지·전송 옵션을 검사한다. 모의 응답 검사는 실계정 작동 증거가 아니다. 실제 시험은 사용자가 정확한 계정과 원고·상태를 승인한 다음 별도로 진행한다. KeyFlow의 추가 검증은 재개하지 않는다.
