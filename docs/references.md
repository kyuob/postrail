# 발행 연동 참고 프로젝트

조사일: 2026-11-10. GitHub 공개 API의 스타 수·저장소 정보와 아래 고정 커밋의 소스를 직접 확인했다. 상위 프로젝트 검색 범위는 `tistory`, `velog`, 각 플랫폼의 `publish`, `cli` 키워드다. 스킨·통계·클론·조회 전용 도구는 발행 참고 대상에서 제외했다. 전 세계 모든 저장소의 절대 순위를 보장하지 않는다. 한국어 README와 한국 블로그 생태계 대상 구현을 선정 근거로 사용했으며, 저자의 국적을 추정하지 않는다.

아래 주요 4개 평가는 소스 조사 결과다. 해당 도구를 설치하거나 사용자의 쿠키·키체인을 읽지 않았으며, 실제 로그인·발행·수정·이미지 업로드 성공을 검증하지 않았다. 후속 KeyFlow 구현 진척은 [어댑터 가이드](keyflow.md)를 따른다. 벨로그·티스토리 연동은 아직 미구현이다.

## 주요 참고 대상: 플랫폼별 2개

| 플랫폼 | 저장소 | 스타 | 저장소 최종 push | 라이선스 확인 | 역할 |
|---|---|---:|---|---|---|
| 티스토리 | [jojoldu/markdown-tistory](https://github.com/jojoldu/markdown-tistory) | 270 | 2024-06-26 | package.json에 MIT 선언, 트리에 별도 LICENSE 미확인 | Markdown CLI·이미지 변환·수정 흐름의 역사적 참고 |
| 티스토리 | [boltlessengineer/Notion2Tistory](https://github.com/boltlessengineer/Notion2Tistory) | 129 | 2024-03-17 | master 브랜치 LICENSE: MIT | 콘텐츠·이미지 변환의 역사적 참고 |
| 벨로그 | [stoneHee99/velog-mcp](https://github.com/stoneHee99/velog-mcp) | 8 | 2026-04-24 | LICENSE: MIT | GraphQL 요청·작성·수정 인터페이스 참고 |
| 벨로그 | [seongwon030/velog_mcp](https://github.com/seongwon030/velog_mcp) | 7 | 2026-11-02 | LICENSE: MIT | 초안·발행·이미지 업로드·토큰 갱신 흐름 참고 |

최종 push는 마지막 기능 수정일이나 실사용 검증일을 뜻하지 않는다. 벨로그는 발행 가능한 관련 프로젝트 중 인지도를 비교해 선정했다. 더 높은 스타를 가진 벨로그 본체·백업 도구를 외부 발행 CLI로 세지 않았다.

## 1. markdown-tistory

검토 커밋: `c9eebcfabcb6ac80cc068fcdaf4365bde669e2dd`.

- [README](https://github.com/jojoldu/markdown-tistory/blob/c9eebcfabcb6ac80cc068fcdaf4365bde669e2dd/README.md): 파일 경로를 입력받는 CLI와 OAuth 인증 흐름.
- [postService.js](https://github.com/jojoldu/markdown-tistory/blob/c9eebcfabcb6ac80cc068fcdaf4365bde669e2dd/src/main/service/post/postService.js): 원고 읽기 → 이미지 경로 변환 → HTML 렌더링 → 작성 또는 기존 글 ID로 수정.
- [package.json](https://github.com/jojoldu/markdown-tistory/blob/c9eebcfabcb6ac80cc068fcdaf4365bde669e2dd/package.json): MIT 선언. 별도 저작권 고지가 확인되기 전에는 코드를 복사하지 않는다.

채택할 설계: 원고·이미지 변환과 플랫폼 전송을 분리하고, 수정 시 기존 글 ID를 사용한다. 과거 OAuth·Open API 구현은 재사용하지 않는다. 오래된 lib와 src가 함께 있으므로 위 파일의 설계 관찰을 현재 실행 경로 전체의 검증으로 취급하지 않는다.

## 2. Notion2Tistory

기본 브랜치는 `gh-pages`이며 README는 배포 페이지 안내뿐이다. 실제 구현은 별도 `master` 브랜치에서 확인했다.

검토 구현 커밋: `fdb144c99709e6b80113c490d234f2e3874ab79f`.

- [TistoryAPI.cs](https://github.com/boltlessengineer/Notion2Tistory/blob/fdb144c99709e6b80113c490d234f2e3874ab79f/TistoryAPI.cs): OAuth, 파일 첨부, 이미지 표현 변환, `post/write` 전송.
- [LICENSE](https://github.com/boltlessengineer/Notion2Tistory/blob/fdb144c99709e6b80113c490d234f2e3874ab79f/LICENSE): MIT.

채택할 설계: 이미지 업로드 결과를 본문에 반영한 뒤 발행한다. Notion 입력은 1차 범위에 넣지 않는다. 과거 로그인·Open API 호출, 인증 코드 출력 방식은 채택하지 않는다.

티스토리 두 프로젝트 모두 종료된 Open API에 의존한다. 티스토리 공식 공지는 글 작성·수정·파일 첨부 API의 종료를 명시한다. 따라서 스타 수가 높아도 현재 발행 엔진으로 사용할 근거는 없다. [공식 종료 공지](https://notice.tistory.com/2664)

## 3. stoneHee99/velog-mcp

검토 커밋: `eb2e005ebe05a25270388d3b39efff31a50be5a4`.

- [velog-client.ts](https://github.com/stoneHee99/velog-mcp/blob/eb2e005ebe05a25270388d3b39efff31a50be5a4/src/velog-client.ts): 조회와 쓰기의 엔드포인트 분리, 쓰기·수정의 input 객체, GraphQL 오류 처리.
- [auth.ts](https://github.com/stoneHee99/velog-mcp/blob/eb2e005ebe05a25270388d3b39efff31a50be5a4/src/auth.ts): Chrome 쿠키 DB와 OS 저장소에 접근하는 인증 구현.
- [LICENSE](https://github.com/stoneHee99/velog-mcp/blob/eb2e005ebe05a25270388d3b39efff31a50be5a4/LICENSE): MIT.

채택할 설계: 전송 계층과 글 기능 분리, GraphQL errors 검사. 기존 Chrome 쿠키 DB 복사·복호화, Chrome Safe Storage 접근은 Postrail의 로그인 방식으로 채택하지 않는다. 서버 응답 원문을 그대로 오류 로그에 노출하는 방식도 피한다.

## 4. seongwon030/velog_mcp

검토 커밋: `63052d5716473ae5984a8180ea32a74b3cde7c15`.

- [publish.ts](https://github.com/seongwon030/velog_mcp/blob/63052d5716473ae5984a8180ea32a74b3cde7c15/src/tools/publish.ts): 초안에서 발행하고 반환된 ID·슬러그로 결과 URL을 기록.
- [upload.ts](https://github.com/seongwon030/velog_mcp/blob/63052d5716473ae5984a8180ea32a74b3cde7c15/src/tools/upload.ts): 이미지 multipart 전송, 제한 시간, 인증 만료 처리.
- [auth.ts](https://github.com/seongwon030/velog_mcp/blob/63052d5716473ae5984a8180ea32a74b3cde7c15/src/auth.ts): 갱신 쿠키 반영, 설정 파일 생성 시 0600 권한 지정.
- [LICENSE](https://github.com/seongwon030/velog_mcp/blob/63052d5716473ae5984a8180ea32a74b3cde7c15/LICENSE): MIT.

채택할 설계: 초안·발행 분리, 결과 ID 기록, 인증 만료의 명확한 오류. README의 운영 허용 문구는 저자의 주장으로만 취급하며 Postrail에 대한 허가로 확대하지 않는다.

두 벨로그 구현은 쓰기 엔드포인트와 mutation 인자 구조가 다르다. 하나는 v3/input 객체, 다른 하나는 v2/개별 인자 방식이다. 소스만 보고 현재 유효한 규격을 확정하지 않는다. 실제 계정으로 검증한 규격만 어댑터에 구현하고, 불확실한 쓰기 실패 뒤 다른 규격으로 자동 재발행하지 않는다.

## 티스토리 현행 방식 보조 참고

인기 있는 과거 도구만으로 현재 구현 방향을 정할 수 없어 [greekr4/viruagent-cli](https://github.com/greekr4/viruagent-cli)도 보조 검토했다. 43★, 최종 push 2026-09-15, MIT. 주요 4개 선정과 별도로 취급한다.

검토 커밋: `f2f0f82dbdc29131bddf1921da9a5db381e29ae3`.

- [auth.js](https://github.com/greekr4/viruagent-cli/blob/f2f0f82dbdc29131bddf1921da9a5db381e29ae3/src/providers/tistory/auth.js): 전용 Chrome 프로필과 세션 유지, 수동 로그인 경로.
- [index.js](https://github.com/greekr4/viruagent-cli/blob/f2f0f82dbdc29131bddf1921da9a5db381e29ae3/src/providers/tistory/index.js): 세션 기반 발행·초안·이미지 처리와 실패 상태 분류.

Postrail은 사용자가 전용 브라우저 창에서 직접 로그인하는 경로를 우선 검증한다. 비밀번호·2FA 코드를 CLI 인자로 받거나, 공개 발행 실패를 알리지 않고 다른 공개 상태로 바꾸는 동작은 채택하지 않는다. 현행 브라우저·내부 요청 방식의 안정성과 서비스 이용 조건은 별도 확인 대상이다.

## KeyFlow와 후속 검증

[공식 llms.txt](https://www.keyflow.me/llms.txt)는 `@keyflow-blog/cli`와 터미널 발행 기능을 안내한다. 초기 조사 이후 공식 CLI 2026.10.20을 고정 설치하고 명령 규격·상태 변환·이미지·JSON 출력의 오프라인 계약을 확인했다. [구현과 남은 실계정 검증](keyflow.md). 다른 MyApp 모듈의 비공개 구현이나 인증을 가져오지 않는다.

다음 증거가 확보되기 전까지 세 플랫폼 모두 지원 상태는 `unverified`다.

1. 현재 버전과 인터페이스를 고정한 읽기 전용 계정 확인.
2. 승인된 테스트 원고의 초안 또는 비공개 생성과 반환 ID 재조회.
3. 같은 ID에 대한 본문·이미지 수정과 공개 상태 보존.
4. 발행 후 응답 유실 시 조회로 판별할 수 있는지 확인. 판별이 불가능하면 `unknown`을 반환하고 자동 재발행 중단.

외부 코드는 이번 작업에 복사하지 않았다. 향후 코드 재사용 시 해당 커밋의 라이선스·저작권 고지를 함께 보존하고 출처 장부를 추가한다.
