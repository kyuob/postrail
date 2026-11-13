# Velog adapter — experimental

## 검증 범위

2026-11-10 기준 v3 어댑터의 실제 Google 로그인·초안 생성·같은ID 수정·재조회·변경 없는 전송 건너뛰기를 확인했다. 사용자는 이후 테스트 초안을 직접 삭제했다. 이어 지정 원고의 비공개→공개 전환, 같은ID 수정과 이미지12개·추천 이미지2개의 실제 클릭을 macOS Chrome에서 확인했다. [초기 실검증](https://github.com/kyuob/postrail/blob/main/docs/bundled-validation-results.md)과 [공개 글 검수](https://github.com/kyuob/postrail/blob/main/docs/publication-fable52.md)를 구분하며, `liveVerified:false`를 모든 기능의 검증 주장으로 바꾸지 않는다. 공개된 안정적 외부 발행API계약은 아니므로 내부 인터페이스 변경에 영향을 받는다.

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

같은 프로젝트·계정·원고 ID는 저장된 원격 ID로 수정한다. 원격 제목·본문·태그·상태·슬러그·썸네일·요약·시리즈가 마지막 저장 상태와 달라지면 덮어쓰지 않는다. 바뀌지 않은 원고도 원격 충돌 확인 후에만 건너뛴다. 기존 슬러그·요약·시리즈를 유지하며, `cover`를 명시하지 않으면 기존 썸네일도 유지한다. 삭제·원격 목록·기존 글 가져오기·자동 충돌 병합은 제공하지 않는다.

대표 이미지가 필요하면 frontmatter에 `cover: ./images/cover.png`처럼 명시하고 본문에도 같은 경로의 이미지를 넣는다. 벨로그 단독 전송만 지원하며, 검증된 로컬 이미지 업로드 결과를 `thumbnail`에 사용한다. 본문과 썸네일에 같은 파일을 두 번 업로드하지 않는다. 썸네일 변경도 원고 해시에 포함해 변경 없는 전송에서 누락되지 않도록 하며, 저장 후 재조회에서 값이 일치해야 성공한다. `get --json`은 실제 `thumbnail` URL도 반환한다.

## 발행 결과 진단과 로컬 이력 대조 · v0.1.2

다음 명령은 v0.1.2 기능이며 이전 v0.1.0 tarball에는 없다. 먼저 실제 전송에 사용한 원고·로컬 이미지·프로젝트의 `.postrail/`을 보존한다. 저장된 글 ID가 없는 기록은 이 도구로 찾거나 새 글로 만들지 않는다.

```sh
node dist/cli.js velog inspect ./article.md --account USERNAME --json
```

`inspect`는 로그인된 작성자와 저장 ID를 확인한 뒤 원문·제목·태그·공개 상태·로컬 이미지의 일치 여부를 보여 준다. 본문 원문이나 쿠키는 출력하지 않는다. 원격 글과 발행 이력을 변경하지 않지만 기존 Chrome 세션의 통상적인 프로필 갱신은 발생할 수 있다. 새 로그인은 별도로 완료해야 한다.

로컬 이미지는 전체 Markdown이 업로드 URL 치환 외에는 정확히 일치할 때만 확인한다. 자격증명 없이 `https://velog.velcdn.com`의 기본 포트로 읽으며 리다이렉트를 따라가지 않는다. 이미지별5초·원본 크기 및5MiB 이내의 응답만 받고 바이트 해시를 원본과 비교한다. 다른 CDN 주소나 변경된 이미지, 확인할 수 없는 이미지는 이력 대조를 차단한다. 원래부터 외부 URL이었던 이미지는 URL을 포함한 본문 일치만 검사하며 외부 이미지의 장기 내용 보존까지 보장하지 않는다.

출력의 `comparisons`와 실제 태그·공개 상태를 읽고 `canReconcile:true`인 경우에만 이력 대조를 검토한다. 공개 상태는 이름뿐 아니라 실제 두 상태 플래그까지 일치해야 한다. `reviewHash`를 복사해 다음 명령의 `HASH_FROM_INSPECT`를 바꾼다. 아래 `--accept-tags`는 표시된 태그 차이를 실제로 수용할 때만 추가하며, 태그 차이가 없으면 생략할 수 있다.

```sh
node dist/cli.js velog reconcile ./article.md --account USERNAME \
  --review HASH_FROM_INSPECT --confirm --accept-tags --json
```

`reconcile`은 pending/unknown 기록에만 적용한다. 원격 글을 다시 읽고 검토 지문을 확인한 뒤, 잠금 아래 기존 이력의 바이트 그대로를 권한 제한된 백업에 보관하고 로컬 상태를 정리한다. 백업이나 그 동기화가 실패하면 이력을 교체하지 않는다. 새 글 생성·본문 수정·재발행·자동 재시도는 수행하지 않는다. 여기서 `succeeded`는 확인한 원격 상태를 로컬 이력에 반영했다는 뜻이며 새 발행이 성공했다는 뜻이 아니다.

원문·제목·본문·이미지·작성자·저장 ID·공개 상태의 차이는 태그 승인으로 우회할 수 없다. 검토 후 원문·로컬 기록·원격 글이 바뀌어도 거절한다. `QA`와 `Q&A`를 자동 동치로 취급하거나 원고의 태그를 수정하지 않는다. 정리한 동일 원고는 대상 선택만 바뀌어도 다시 쓰지 않으며, 다음 전송에서도 먼저 원격 충돌을 확인한다. 원고 내용을 수정하면 기존의 엄격한 저장 검증을 다시 적용한다.

원래 공통 전송 때 원고의 선언과 다른 `--to`를 사용했다면, 진단과 이력 대조 양쪽에 같은 순서로 `--published-to velog,tistory`처럼 지정한다. 기록의 해시와 정확히 일치해야 하며 임의로 대상 조합을 탐색하지 않는다. 기존 잠금은 자동으로 삭제하지 않는다. 파일시스템 오류가 난 경우 기록과 백업을 보존하고 `status`로 확인한다. 다른 플랫폼의 복구 명령은 아직 지원하지 않는다.

## 파일과 세션

세션은 사용자 홈의 `~/.postrail/velog-profiles/<계정 해시>/`에 보관하며 디렉터리는 0700으로 제한한다. Chromium이 저장하는 로컬 세션이므로 해당 사용자 계정과 디스크 보안에 의존한다. 기존 Chrome 프로필, 쿠키 DB, Keychain을 읽거나 복호화하지 않는다. 세션 경로를 공유·백업·Git 추가하지 않는다. 같은 계정의 Postrail Chrome 창을 동시에 열지 않는다.

원고별 기록은 프로젝트의 `.postrail/velog/<계정·원고 해시>/state.json`에 0600으로 원자적으로 저장한다. 게시글 ID와 해시만 남기며 쿠키·본문·토큰은 기록하지 않는다. `.postrail/`은 Git에서 제외한다. 기록을 잃거나 다른 프로젝트 폴더로 이동하면 기존 원격 ID를 찾지 못해 새 글이 생길 수 있으므로 기록도 안전하게 보존해야 한다.

로컬 이미지는 공통 검사에서 읽어둔 버퍼를 업로드한다. 원고 폴더 안의 PNG/JPEG/GIF/WebP만 허용하며 기존 파일 제한을 적용한다. Markdown AST의 이미지 위치를 사용해 전송 본문만 CDN URL로 바꾸고 원본 Markdown·이미지는 수정하지 않는다. 두 Markdown 파서가 이미지 구문에 동의하지 않으면 전송 전에 거절한다. 참조 이미지도 지원하며 코드블록 안의 예시는 바꾸지 않는다. 원격 이미지는 다시 업로드하지 않는다. 이미지 업로드 후 글 저장이 실패하면 서버에 미사용 이미지가 남을 수 있다.

## 불확실한 결과와 복구 한계

업로드 전에 `pending`을 저장하고 잠금을 잡는다. 이미지·글 쓰기·읽기 확인 중 실패하면 `unknown`을 남기며 자동 재생성을 막는다. 글 저장 응답의 ID는 읽기 확인 전에 보존한다. 네트워크 재시도, 리다이렉트, v2/v3 쓰기 규격 자동 전환은 하지 않는다. 정확히 한 번 전송을 보장하지 않는다.

`pending`, `unknown`, 남은 잠금은 원격 결과와 대조해야 한다. ID가 있으면 `get`으로 읽을 수 있고, v0.1.2에서는 위의 `inspect`와 명시적 로컬 `reconcile`을 사용할 수 있다. 자동 복구나 자동 성공 승격은 하지 않는다. 결과를 확인하기 전 기록이나 잠금을 지우고 다시 전송하지 않는다. 원격 충돌도 사용자 판단으로 해결해야 하며 자동 덮어쓰기 옵션은 없다.

고정 v3 HTTPS 엔드포인트에만 인증 요청을 보낸다. 응답 본문·서버 오류·쿠키는 출력하지 않는다. 응답 파싱은 8 MiB까지 허용하지만 Playwright가 응답을 메모리에 받은 뒤 검사하는 한계가 있다. CDN 반환 URL은 HTTPS `velcdn.com` 또는 하위 도메인만 허용한다. 실제 계정 지원 OS와 인증 만료 복구는 미검증이다.

POSIX에서는 상태 파일과 디렉터리 이름 변경을 fsync한다. Windows에서는 디렉터리 fsync를 건너뛰므로 전원 장애 뒤 저널 보존을 보장하지 않는다. 원격 변경 확인과 실제 수정 사이에 다른 사용자가 수정하는 경합도 서버의 조건부 쓰기 기능 없이 완전히 막을 수 없다. 파일 잠금은 같은 로컬 원고·계정에만 적용된다.

## 근거와 검사

- [공식 v3 Post 스키마](https://github.com/velog-io/velog/blob/63dcace01e1c87b35a38027f681d9e7c0f210467/apps/server/src/graphql/Post.gql): input 객체, ID 읽기, 초안·비공개 필드.
- [공식 업로드 라우트](https://github.com/velog-io/velog/blob/63dcace01e1c87b35a38027f681d9e7c0f210467/apps/server/src/routes/files/v3/index.mts), [업로드 처리](https://github.com/velog-io/velog/blob/63dcace01e1c87b35a38027f681d9e7c0f210467/apps/server/src/routes/files/v3/filesController.mts): multipart `image`, `type=post`, 반환 `path`.
- [참고한 한국 개발자 프로젝트 2개](https://github.com/kyuob/postrail/blob/main/docs/references.md): 읽기 전용으로 규격을 비교했으며 쿠키 추출 코드는 채택하지 않았다.
- [Playwright APIRequestContext](https://playwright.dev/docs/api/class-apirequestcontext): 브라우저 컨텍스트의 쿠키를 공유하고 Set-Cookie를 반영한다.

`bun run check:velog`는 공통 CLI와 Velog의 생성·수정·읽기 확인·충돌·unknown·이미지·전송 옵션을 검사한다. 모의 응답 검사는 실계정 작동 증거가 아니다. 실제 시험은 사용자가 정확한 계정과 원고·상태를 승인한 다음 별도로 진행한다. KeyFlow의 추가 검증은 재개하지 않는다.
