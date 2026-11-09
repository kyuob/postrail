# Google Blogger 연결 계획

대상 ID: `blogger`. 현재 CLI의 설정·원고 검증·오프라인 발행 계획에서 인식한다. **Google 로그인, 글 생성·수정·발행 어댑터는 아직 구현하지 않았다.** 이 작업은 Google 계정이나 Cloud 설정을 읽거나 바꾸지 않는다.

```sh
node dist/cli.js validate examples/blogger.md --json
node dist/cli.js plan examples/blogger.md --to blogger --json
node dist/cli.js plan examples/article.md --to velog,tistory,keyflow,blogger --json
```

Blogger 계획은 `status: unverified`, `canPublish: false`, `blockers: [ADAPTER_NOT_IMPLEMENTED]`를 반환한다. `blogger`가 유효한 대상이라는 사실과 실제 전송 지원은 구분한다. 새 `init` 설정과 설정이 없을 때의 기본 대상은 네 플랫폼이며, 기존 설정 파일에 명시한 대상 목록은 자동 변경하지 않는다. 기존 KeyFlow 실검증에 사용한 examples/article.md도 유지한다.

## 공식 인터페이스

2026-11-10에 Google 공식 문서를 확인했다.

| 기능 | 공식 경로 | 구현 시 기준 |
|---|---|---|
| 블로그 목록/선택 | blogs.listByUser | 계정과 blogId를 명시적으로 묶고 잘못된 블로그로 전송하지 않기 |
| 초안 생성 | posts.insert + isDraft=true | 생성 응답의 post ID와 상태 기록 |
| 원격 조회 | posts.get | 생성·수정 후 내용과 상태 확인, 불확실한 결과의 재생성 방지 |
| 같은 글 수정 | posts.update 또는 patch | 기존 blogId/postId 사용, 원격 수정 충돌과 상태 보존 확인 |
| 공개 전환 | posts.publish | 명시적인 공개 요청에만 실행 |

글쓰기 권한은 OAuth 2.0의 `https://www.googleapis.com/auth/blogger` scope가 필요하다. API 키만으로 사용자 글을 작성할 수 없다. 데스크톱 OAuth 클라이언트와 시스템 브라우저·PKCE·로컬 콜백 흐름을 기준으로 설계하며, API 활성화·동의 화면·배포 형태에 따른 Google 정책을 구현 전에 확인한다. 다른 MyApp 모듈의 Google 자격증명을 가져오지 않으며 토큰을 원고·프로젝트 설정·로그·Git에 넣지 않는다.

게시글 본문은 HTML을 받으므로 Markdown을 안전하게 변환해 `content`에 넣고 태그는 `labels`에 매핑할 예정이다. Blogger posts API가 제공하는 초안/발행 상태와 Postrail의 `private`를 동일하게 취급하지 않는다. 개별 비공개 게시글 지원 여부를 확인하기 전에는 `private`를 공개 글이나 초안으로 조용히 변환하지 않는다.

게시글 문서에 이미지 URL 표현이 있어도 로컬 파일 업로드 지원을 뜻하지는 않는다. 별도 업로드 경로를 확인하기 전에는 로컬 이미지 업로드를 지원한다고 표시하지 않는다. 외부 이미지 URL의 처리 방식도 별도 검증 항목이다.

## 후속 작업과 완료 조건

1. OAuth 설정과 계정별 안전한 세션 보관 계약 구현.
2. 블로그 목록 조회·대상 blogId 선택 및 인증 만료 처리.
3. Markdown → HTML 변환과 초안 생성·조회·같은 ID 수정 구현.
4. 계정+blogId+원고 ID 기반 전송 이력, 충돌·부분 실패·unknown 처리.
5. 이미지 경로와 공개 상태 지원표 확정 후, 승인된 테스트 원고로 실계정 검증.

OAuth 연결·Cloud 설정 변경·실제 블로그 전송은 현재 작업에 포함되지 않는다. 구현과 실제 계정 검증은 이후 별도 작업 범위다.

## 근거

- [Blogger API 사용과 인증](https://developers.google.com/blogger/docs/3.0/using)
- [API 전체 메서드](https://developers.google.com/blogger/docs/3.0/reference)
- [초안 생성: posts.insert](https://developers.google.com/blogger/docs/3.0/reference/posts/insert)
- [글 수정: posts.update](https://developers.google.com/blogger/docs/3.0/reference/posts/update)
- [게시글 HTML·labels·status 표현](https://developers.google.com/blogger/docs/3.0/reference/posts)
- [데스크톱 OAuth 흐름](https://developers.google.com/identity/protocols/oauth2/native-app)
