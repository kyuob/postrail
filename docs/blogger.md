# Google Blogger 어댑터 — 실험적

대상 ID: `blogger`. Desktop OAuth 로그인·토큰 갱신·관리자 블로그 목록·초안 생성·ID 조회·PATCH 수정·발행/초안 전환을 구현했다. 2026-11-10 사용자 지정 계정에서 실제 OAuth·관리자 블로그 선택·초안 1개 생성·같은 ID 수정·인증 조회·변경 없는 재전송 건너뛰기를 확인했다. [실검증 범위](bundled-validation-results.md)를 따른다. Cloud 설정은 바꾸지 않았으며 화면/이미지 표시·실제 만료 갱신·공개 전환·충돌 API 동작은 미검증이다.

```sh
node dist/cli.js blogger check examples/blogger.md --json
node dist/cli.js blogger login --account main --client-config /outside/repo/desktop-client.json
node dist/cli.js blogger blogs --account main --json
node dist/cli.js blogger status examples/blogger.md --account main --blog-id BLOG_ID --json
node dist/cli.js blogger push examples/blogger.md --account main --blog-id BLOG_ID --confirm --json
node dist/cli.js blogger get examples/blogger.md --account main --blog-id BLOG_ID --json
```

`check`/`status`와 일반 `plan`은 인증·네트워크 없이 실행한다. plan은 `status:experimental`, `canPublish:false`, `DESTINATIONS_REQUIRED`와 `CONFIRM_REQUIRED` 및 미지원 입력 blocker를 반환한다. 공통 전송은 [publish](publish.md)의 대상 파일과 명시적 확인으로 실행한다.

## 공식 인터페이스

2026-11-10에 Google 공식 문서를 확인했다.

| 기능 | 공식 경로 | 구현 시 기준 |
|---|---|---|
| 블로그 목록/선택 | blogs.listByUser | 계정과 blogId를 명시적으로 묶고 잘못된 블로그로 전송하지 않기 |
| 초안 생성 | posts.insert + isDraft=true | 생성 응답의 post ID와 상태 기록 |
| 원격 조회 | posts.get | 생성·수정 후 내용과 상태 확인, 불확실한 결과의 재생성 방지 |
| 같은 글 수정 | posts.patch | 기존 blogId/postId로 제목·본문·labels만 변경, 나머지 필드 생략 |
| 공개 전환 | posts.publish | 명시적인 공개 요청에만 실행 |

글쓰기 권한은 OAuth 2.0의 `https://www.googleapis.com/auth/blogger` scope가 필요하다. API 키만으로 쓸 수 없다. 사용자 소유 Google Cloud 프로젝트의 Blogger API 활성화·동의 화면·Desktop app 클라이언트를 준비해야 하며, 테스트 사용자·조직 정책·검증 상태에 따라 Google이 동의를 제한할 수 있다. Postrail은 Cloud 설정을 자동 변경하지 않는다. 다른 MyApp 모듈의 Google 자격증명을 가져오지 않는다.

Markdown을 raw HTML 비활성 상태로 HTML 렌더링해 `content`에 넣고 태그는 `labels`로 보낸다. `draft`/`public`만 지원한다. 개별 `private`는 초안이나 공개로 바꾸지 않고 전송 전에 거절한다. 원본 Markdown과 이미지는 수정하지 않는다.

로컬 이미지 업로드는 미지원이며 인증·전송 전에 거절한다. 원고의 원격 이미지 URL은 HTML에 유지하지만 내려받거나 재업로드하지 않는다. Google의 실제 렌더링·재호스팅은 미검증이다. 외부 이미지가 표시되면 그 호스트에 독자 요청이 발생할 수 있다.

## 인증과 보관

`--account`는 이메일 대신 쓰는 로컬 별칭이다. 처음 동의한 Blogger 사용자 ID에 묶으며 재로그인한 사용자가 달라지면 덮어쓰지 않는다. 사용자가 시스템 브라우저에서 계정을 직접 고른다. ID가 묶였다는 사실은 Google 이메일/OIDC 신원을 검증했다는 뜻이 아니다. 글쓰기 대상은 숫자 blogId와 ADMIN 권한을 확인한다. AUTHOR 전용 계정은 현재 미지원이다. `blogs`는 관리자 블로그 ID와 이름을 출력한다.

Desktop 클라이언트 JSON은 저장소 밖의 0600 파일로 두고 `--client-config`에 경로만 준다. Web/서비스 계정 JSON은 거절한다. 파일의 임의 인증/토큰 URL을 쓰지 않고 고정 Google 엔드포인트만 호출한다. S256 PKCE와 무작위 state를 쓰며 `127.0.0.1`의 임의 포트에서 최대 3분 동안 콜백을 기다린다. Host·경로·state·단일 code를 검사하고 재사용을 막는다. 코드·토큰·인증 URL·서버 응답을 출력하지 않는다. 비밀번호나 토큰을 터미널/채팅 인자로 받지 않는다. login은 --json을 받지 않으며 실패는 일반 stderr 오류 형식이다.

계정의 클라이언트 설정·access/refresh token은 사용자 홈 `~/.postrail/blogger-accounts/<계정 해시>/credentials.json`에 0600으로 저장하며 부모는 0700이다. OS Keychain 암호화 저장소가 아닌 권한 제한 로컬 JSON이므로 사용자 계정·디스크 보안에 의존한다. Git·동기화·공용 로그에 넣지 않는다. Windows는 ACL 검증이 없어 인증/자격증명 보관을 명시적으로 미지원한다. macOS의 실제 OAuth는 검증했으며 Linux는 실계정 미검증이다. 오프라인 명령은 별개다.

만료 60초 이내의 토큰은 명령 시작 전에 refresh로 갱신한다. 서버 오류/401 뒤 원래 글쓰기를 자동 재실행하지 않는다. refresh grant가 만료/철회되면 명시적 재로그인이 필요하다. Google의 외부 Testing 앱 토큰 수명 같은 정책은 별도 운영 제약이며 영구 로그인을 보장하지 않는다. 계정 잠금으로 동시 refresh를 직렬화한다.

## 전송·상태·복구

새 글은 원고가 public이어도 먼저 `isDraft=true`로 생성한다. ID를 기록하고 ADMIN 조회로 초안의 제목·HTML 구조·태그·상태를 확인한 후에만 별도 publish를 호출한다. 공개 글을 draft로 바꿀 때는 먼저 revert와 초안 상태/기존 본문을 확인한 뒤 새 초안 내용을 PATCH한다. revert 실패 시 새 내용을 공개 글에 보내지 않는다. source의 visibility와 --confirm은 상태 전환에도 적용한다. 실제 공개 전송은 정확한 원고·대상·상태에 대한 승인 후에만 시험한다.

수정은 저장된 blogId/postId로 PATCH하며 제목·본문·labels만 보낸다. 마지막 해시와 원격 제목·본문·태그·상태·ETag·수정시각·추가 메타데이터를 비교하고, 다른 곳에서 바뀌면 건너뛰기보다 충돌을 우선한다. PATCH와 상태 전환에는 읽은 If-Match를 보낸다. Google 문서는 조건부 수정 설계를 설명하지만 각 전환 API의 실제 ETag 적용은 묶음 검증에서 확인해야 한다. 완전한 경합 방지를 주장하지 않는다.

프로젝트 기록은 `.postrail/blogger/<계정·블로그·원고 해시>/state.json`에 0600으로 저장한다. 본문·토큰 없이 ID·상태·해시를 남긴다. 첫 쓰기 전에 pending을 저장하고 실패하면 unknown으로 남긴다. 응답 ID는 읽기 확인 전에 보존한다. 자동 재생성·쓰기 재시도·리다이렉트를 하지 않는다. 정확히 한 번 전송을 보장하지 않는다. 계정 및 원고 잠금이 남거나 pending/unknown이면 원격 결과를 직접 확인한다. ID가 있으면 get으로 읽을 수 있지만 자동 복구/승격 명령은 없다. 기록을 잃거나 프로젝트를 옮기면 새 글이 생길 수 있다.

POSIX 파일·디렉터리를 fsync하며 Google JSON 응답은 스트림을 읽으며 8 MiB로 제한한다. 추가 서버 HTML 정규화, OAuth 동의/갱신, 실제 권한과 상태/ETag는 실계정 검증 전까지 미확인이다. 예약·삭제·기존 글 가져오기·복구 자동화·패키지 릴리스는 범위 밖이다.

## 검사와 다음 단계

`bun run check:blogger`는 공통 CLI·Velog·Tistory·Blogger의 모의 응답 검사와 빌드/smoke를 실행한다. OAuth 시험은 가짜 자격증명과 로컬 loopback만 쓰며 Google 계정에 접근하지 않는다. [묶음 실계정 검증 계획](bundled-validation.md)에 따라 계정·정확한 원고·상태를 사용자가 한 번에 확인한 뒤 실제 검증한다. KeyFlow 추가 검증은 재개하지 않는다.

## 근거

- [Blogger API 사용과 인증](https://developers.google.com/blogger/docs/3.0/using)
- [API 전체 메서드](https://developers.google.com/blogger/docs/3.0/reference)
- [초안 생성: posts.insert](https://developers.google.com/blogger/docs/3.0/reference/posts/insert)
- [글 수정: posts.update](https://developers.google.com/blogger/docs/3.0/reference/posts/update)
- [부분 수정과 If-Match](https://developers.google.com/blogger/docs/3.0/performance)
- [Blogger Discovery 규격](https://blogger.googleapis.com/$discovery/rest?version=v3)
- [게시글 HTML·labels·status 표현](https://developers.google.com/blogger/docs/3.0/reference/posts)
- [데스크톱 OAuth 흐름](https://developers.google.com/identity/protocols/oauth2/native-app)
