# Tistory adapter — experimental

## 검증 범위

2026-11-10: 전용 Chrome 로그인, 내부 관리 API의 비공개/공개 글 생성, 저장된 ID의 PUT 수정, 이미지 업로드와 첨부 등록 코드를 구현했다. 공통 CLI·Velog·Tistory 모의 응답 검사 105개가 통과했다. 독립 검토에서 발견한 문자 참조를 통한 플랫폼 치환자 우회는 수정하고 재검토했다.

macOS에서 실제 로그인·비공개 생성·같은ID 수정·재조회·변경 없는 전송 건너뛰기를 확인했다. 이어 지정 원고의 공개 전환·같은ID 수정, 첨부 이미지12개와 추천 이미지2개의 클릭, 문단·설명 간격을 실제Chrome화면에서 확인했다. [초기 실검증](bundled-validation-results.md)과 [공개 검수](publication-fable52.md)를 구분한다. Markdown은HTML로 변환해 저장하며 편집기 모드를 자동 선택하는 방식이 아니다. 명령의 `liveVerified:false`를 모든 기능의 검증 주장으로 바꾸지 않는다. 지원하지 않는 편집기 형식은 중단한다. [공식 Open API는 종료](https://notice.tistory.com/2664)됐으며 과거OAuthAPI를 사용하지 않는다. 내부 인터페이스는 서비스 변경에 영향을 받는다.

## 명령과 대상

`bun install --frozen-lockfile`, `bun run build` 후 Node.js 22+와 Google Chrome으로 실행한다. Playwright Core는 런타임 의존성이며 별도 브라우저 다운로드는 실행하지 않는다.

```sh
node dist/cli.js tistory check examples/tistory.md --json
node dist/cli.js tistory status examples/tistory.md --blog BLOG_NAME --blog-id BLOG_ID --json
node dist/cli.js tistory login --blog BLOG_NAME --blog-id BLOG_ID
node dist/cli.js tistory push examples/tistory.md --blog BLOG_NAME --blog-id BLOG_ID --confirm --json
node dist/cli.js tistory get examples/tistory.md --blog BLOG_NAME --blog-id BLOG_ID --json
```

`BLOG_NAME`은 URL이나 `.tistory.com`을 제외한 정확한 서브도메인 이름이다. 커스텀 도메인은 받지 않는다. `BLOG_ID`는 숫자 블로그 ID이며 게시글 ID와 다르다. 사용자가 로그인한 관리자 글쓰기 페이지의 개발자 도구 콘솔에서 `window.Config.blog.blogSettings.blogId`를 확인할 수 있다. 비밀번호·쿠키를 조회하거나 공유하지 않는다.

인증된 편집기의 canonical 도메인과 blogId가 모두 일치해야 한다. 개인 사용자 ID를 확인하는 방식은 아니므로 블로그에 접근할 수 있는 로그인 계정은 사용자가 직접 확인한다. `check`/`status`는 인증·브라우저·네트워크 없이 실행한다. `check`의 `canPush`는 입력 상태만 뜻하며 실계정 성공을 보장하지 않는다.

macOS의 `login`은 일반 Chrome을 Postrail 전용 프로필로 열어 시간 제한 없이 기다린다. 로그인 중 자동화·원격 디버깅을 연결하지 않는다. 카카오 인증·2FA·CAPTCHA는 사용자가 직접 완료한다. 로그인 후 전용 Chrome 앱을 **⌘Q로 완전히 종료**하면 CLI가 같은 전용 프로필을 백그라운드에서 열어 블로그 주소와 숫자 ID를 확인한다. 창만 닫으면 프로세스가 남을 수 있다. 다른 운영체제의 수동 로그인은 미지원이다. 비밀번호 환경변수, 기존 Chrome 쿠키 DB, Keychain 추출, 인증 우회를 사용하지 않는다. Chrome의 일반 OS 저장소를 사용하며 저장소 접근 확인은 사용자가 직접 판단한다. 세션 만료나 게시 중 추가 인증이 요구되면 멈추며 쓰기를 자동 재전송하지 않는다.

티스토리 전용 프로필은 수동 로그인과 백그라운드 실행 모두 Chrome의 `--restore-last-session` 옵션을 사용한다. 세션 쿠키가 재실행 때 제거되는 문제를 줄이기 위한 정상 세션 복원이며, 기존 로그인 탭이 복원될 수 있다. 별도 합성 쿠키 검사에서는 옵션 없이 세션 쿠키가 사라지고 옵션을 켜면 보존되는 것을 확인했다. 실제 티스토리 세션 보존은 별도 검증 대상으로 구분한다.

## 공개 상태와 요청

- `private`: `visibility:0`인 실제 비공개 게시글. 임시저장 슬롯이 아니다.
- `public`: `visibility:20`인 공개 게시글. 승인된 원고만 전송한다.
- `draft`: 미지원. 기본 초안 원고를 비공개로 자동 변경하지 않으며 저장·인증·업로드 전에 push를 거절한다. check는 `canPush:false`, `TISTORY_DRAFT_UNSUPPORTED`를 반환한다.

생성은 `POST /manage/post.json`, 수정은 `PUT /manage/post/{id}.json`이다. POST body에 기존 ID를 넣어 수정하지 않는다. `published:0`도 실제 글을 생성할 수 있어 초안 기능으로 쓰지 않는다. 댓글·예약·보호글·페이지·삭제·기존 글 가져오기·카테고리 변경·다중 발행은 범위 밖이다.

## 변환과 읽기 확인

원본 Markdown·이미지는 바꾸지 않는다. 검증된 Markdown 토큰을 HTML로 렌더링하며 raw HTML은 비활성이다. 로컬 이미지는 원고 폴더 내 PNG/JPEG/GIF/WebP로 제한하고 읽어둔 버퍼를 쓴다. 공통 크기 제한과 치수 검사를 적용하고 중복 이미지는 한 번만 업로드한다.

`/manage/post/attach.json`의 multipart `file`로 올린 뒤, HTTPS 호스트·경로·key·filename이 맞는 응답만 인정한다. 서명 query를 포함한 `kage@...` 참조를 본문 치환자와 `attachments` 양쪽에 등록한다. 서명 URL을 로그나 상태 파일에 남기지 않는다. 이미지 대체 텍스트는 현재 HTML 캡션으로 전달된다. 원격 이미지는 재업로드하지 않는다. 실패 시 미사용 자산이 남을 수 있고 장기 표시·서버 영구화는 미검증이다.

응답 URL은 요청한 블로그의 숫자 글 경로만 인정한다. ID를 즉시 기록한 뒤 `/manage/newpost/{id}`의 편집기 데이터를 읽는다. `window.Config`는 script 요소 안의 단일 JSON5 객체 리터럴만 파싱하며 Function·eval·VM이나 서버 스크립트를 실행하지 않는다. 현재 Config.post의 category와 기존 Config.entry의 categoryId를 구분해 읽으며 두 형식이 동시에 있으면 거절한다. id/title/content/visibility/tags/slogan을 확인하고 숫자 문자열 옵션을 검증한다. 원시 편집기 필드는 그대로 충돌 지문에 포함한다. 저장 후 이미지 크기의 숫자·숫자 문자열 차이만 정규화하며 실제 크기·참조·스타일 변경은 계속 검출한다.

읽기 확인은 제목·HTML 구조·태그·상태·카테고리와 기존 슬러그를 요청값과 비교한다. 문단의 `data-ke-size`, `tm-h-N` 형식의 자동 헤딩 ID만 장식으로 제외한다. 코드 하이라이트·추가 버튼·이미지 치환 등 다른 서버 변환은 엄격 비교에서 실패할 수 있으며 unknown으로 남긴다.

수정 전에 전체 editor 객체의 마지막 해시와 비교해 외부 변경을 차단한다. 업데이트 요청은 기존 카테고리·슬러그와 노출된 CCL/여백 옵션을 보존한다. 전체 editor 객체를 요청으로 복사하지 않으며 그 밖의 필드 보존까지 검증된 것은 아니다. 확인과 쓰기 사이의 원격 경합은 조건부 서버 쓰기 없이 완전히 막을 수 없다.

## 저장과 복구

프로필은 `~/.postrail/tistory-profiles/<blog·blogId 해시>/`의 0700 디렉터리에 둔다. Chrome 로컬 세션 보안은 사용자 계정·디스크 보호에 의존한다. 개인 Chrome 프로필을 재사용하지 않고 프로필과 내부 로그를 공유하거나 Git에 넣지 않는다.

기록은 프로젝트의 `.postrail/tistory/<blog·blogId·원고ID 해시>/state.json`에 0600으로 저장한다. 제목·본문·쿠키·서명 URL 없이 ID·해시·상태만 기록한다. 동시 실행을 잠그고 첫 이미지/글 전송 전 pending을 저장한다. 불확실한 결과는 unknown으로 남기며 자동 재생성을 차단한다. 응답 ID는 읽기 확인 전 보존한다. 네트워크 재시도·리다이렉트·다른 API 형식 자동 전환은 하지 않는다.

잠금·pending·unknown은 원격 보관함에서 직접 확인해야 한다. ID가 있으면 get으로 읽을 수 있지만 자동 복구/승격은 없다. 확인 전 기록이나 잠금을 지우지 않는다. 기록을 잃거나 프로젝트를 옮기면 새 글이 생길 수 있다. 정확히 한 번 전송을 보장하지 않는다.

POSIX는 상태 파일과 디렉터리를 fsync한다. 응답 파싱은 8 MiB까지 허용하지만 Playwright가 메모리에 수신한 후 검사하는 한계가 있다. 수동 로그인과 실제 비공개 저장 검증은 macOS에서만 확인했으며 다른 OS의 인증은 지원하지 않는다.

## 근거와 후속 검사

- [MIT 참고 API 문서](https://github.com/kim-se-hee/tistory-mcp/blob/bc9d258730ec9421aa2dfec749c720aa7599949f/docs/api.md), [코드](https://github.com/kim-se-hee/tistory-mcp/blob/bc9d258730ec9421aa2dfec749c720aa7599949f/src/tistory/api.ts): 생성/PUT·상태·HTML 읽기·첨부 규격을 참고해 독립 구현했다.
- [@itapi-core/mcp-tistory 1.5.3](https://www.npmjs.com/package/@itapi-core/mcp-tistory/v/1.5.3): 설치/실행 없이 공개 배포물의 Config.entry 필드를 확인했다. VM 평가·비밀번호 자동 로그인·재시도는 채택하지 않았다.
- [조사](references.md), [묶음 실계정 검증 계획](bundled-validation.md).

`bun run check:tistory`는 인증 없이 모의 전송·오류·원본·저널·HTML·이미지 계약을 검사한다. 실계정 검증은 Blogger 구현 후 묶어서 진행한다. KeyFlow 추가 검증은 재개하지 않는다.
