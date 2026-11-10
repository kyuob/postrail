# 오프라인 CLI 사용법

v0.1.2의 `images` 명령은 제한을 넘긴 원고에서도 파일별 크기·전체 합계·초과량을 보여 준다. [이미지 용량 안내](images.md)를 참고한다. 원본을 변경하거나 외부 이미지를 다운로드하지 않는다.

이 문서의 명령: `init`, `validate`, `preview`, `plan`, 도움말, 버전. 이 오프라인 명령은 인증 정보를 읽거나 네트워크 요청을 하지 않는다. 별도 [KeyFlow 명령](keyflow.md)은 로그인·전송 기능을 제공하며 기존 스킬 활용을 바탕으로 사용자 확정한 연동이다. 추가 KeyFlow 검증은 종료했다.

## 실행

개발에는 Bun 1.3+, 빌드된 CLI 실행에는 Node.js 22+가 필요하다. 저장소에서 아래 순서로 실행한다.

```sh
bun install --frozen-lockfile
bun run build
node dist/cli.js validate examples/article.md
node dist/cli.js preview examples/article.md --output preview.html
node dist/cli.js plan examples/article.md --to velog,tistory,keyflow,blogger --json
```

명령 예시의 `node dist/cli.js`가 배포 후 `postrail` 실행 파일에 해당한다. 패키지는 아직 레지스트리에 발행하지 않았다. `preview.html`은 브라우저에서 직접 열 수 있으며, 이미 존재하면 새 출력 경로를 사용해야 한다. 브라우저를 자동 실행하지 않는다.

## 프로젝트 설정

`postrail init`은 현재 디렉터리에 다음 `postrail.json`을 만든다. 원고나 로그인 세션은 만들지 않는다. 파일·심볼릭 링크가 이미 있으면 덮어쓰지 않는다.

```json
{
  "version": 1,
  "targets": ["velog", "tistory", "keyflow", "blogger"],
  "visibility": "draft"
}
```

원고 명령은 현재 작업 디렉터리의 `postrail.json`만 읽는다. 상위 폴더를 검색하지 않는다. 기본 설정 파일이 없으면 위 기본값을 사용한다. 기존 설정에 명시한 대상 목록은 자동으로 늘리지 않는다. `--config <file>`을 명시했는데 파일이 없거나 잘못되면 오류다. 설정은 위 세 필드를 모두 요구하며 알 수 없는 필드는 거부한다.

우선순위: `plan --to` → 원고의 `targets` → 설정의 `targets`. 공개 상태는 원고의 `visibility` → 설정의 `visibility` 순이다. 다른 명령에서는 `--to`를 받지 않는다. 명령 옵션으로 공개 상태를 바꾸지 않는다.

## 원고 형식

UTF-8 Markdown의 첫 부분을 `---` 줄로 감싼 YAML로 작성한다. UTF-8 BOM과 CRLF도 허용한다. YAML 별칭·사용자 정의 태그·중복 키·알 수 없는 필드는 거부한다. [전체 예제](../examples/article.md)를 참고한다.

```yaml
---
id: first-post
title: 첫 번째 개발 기록
tags: [개발, CLI]
visibility: draft
targets: [velog, tistory, keyflow, blogger]
---
본문을 작성합니다.
```

| 필드 | 필수 | 규칙 |
|---|---|---|
| id | 예 | 영문·숫자로 시작, 영문·숫자·점·밑줄·하이픈 1~128자. 직접 정하고 파일 이동 후에도 유지 |
| title | 예 | 비어 있지 않은 한 줄, 최대 200 UTF-16 코드 단위 |
| tags | 아니요 | 중복 없는 문자열 배열, 최대 30개, 각각 최대 100 UTF-16 코드 단위. 생략 시 빈 배열 |
| visibility | 아니요 | draft/private/public. 플랫폼이 세 상태를 모두 지원한다는 뜻은 아님 |
| targets | 아니요 | velog/tistory/keyflow/blogger 중 중복 없는 비어 있지 않은 배열 |

선택 필드를 쓸 때 `null`은 허용하지 않는다. 본문도 비어 있으면 안 된다. 원고는 최대 2 MiB, frontmatter는 최대 32,768 UTF-16 코드 단위, 설정은 최대 64 KiB다.

`contentHash`는 정규화한 메타데이터·본문·로컬 이미지 바이트를 반영한 SHA-256이다. 원고 파일 경로는 포함하지 않으므로 같은 원고와 이미지 구성을 이동해도 값이 같다. 이미지 파일만 바뀌어도 해시가 바뀐다. 발행 이력·원격 중복 검사는 아직 구현하지 않았다.

## 이미지와 미리보기

- Markdown 이미지와 참조형 이미지 문법을 읽는다. 코드블록 안의 이미지 예시는 파일로 읽지 않는다.
- 로컬 이미지는 원고 파일 디렉터리 안의 상대경로만 허용한다. 심볼릭 링크의 실제 대상도 이 범위 안에 있어야 한다. 부모 폴더로 나가는 경로·절대경로·SVG는 지원하지 않는다.
- PNG/JPEG/GIF/WebP의 확장자와 기본 파일 시그니처를 검사한다. 완전한 이미지 디코딩 검사는 아니다. 파일당 최대 5 MiB, 중복 경로를 제외한 로컬 이미지 합계는 최대 20 MiB다.
- 미리보기에는 로컬 이미지 바이트를 data URL로 넣는다. HTML 파일을 공유하면 포함된 이미지도 함께 공유된다.
- HTTP(S) 외부 이미지는 다운로드하지 않고 자리표시자로 바꾼다. 검증 결과에 `REMOTE_IMAGES_NOT_FETCHED` 경고를 반환한다. 외부 이미지의 존재·유효성은 검증하지 않는다.
- 원고의 raw HTML은 실행하지 않고 글자로 표시한다. JavaScript·file URL 링크를 만들지 않으며 CSP로 스크립트·네트워크 자원 로딩을 제한한다. 일반 HTTP(S)/메일 링크는 사용자가 클릭하면 이동할 수 있다.
- 코드블록·표·링크를 렌더링한다. 플랫폼 고유 서식, Mermaid 실행, 코드 색상 강조는 현재 제공하지 않는다.

`preview`는 기본적으로 HTML을 stdout에 출력한다. `--output <new.html>`을 주면 새 파일로 저장하며 기존 파일을 덮어쓰지 않는다. 부모 디렉터리는 미리 만들어야 한다. 셸의 `>` 리다이렉션은 셸 자체가 파일을 덮어쓸 수 있으므로, 보호가 필요하면 `--output`을 사용한다.

## JSON과 종료 코드

`--json` 성공·실패 결과는 stdout에 JSON 객체 하나로 출력한다. 사람이 읽는 오류는 기본 stderr에 출력한다. 성공은 종료 코드 0, 오류는 1이다. 도움말·버전은 단독 명령이며 `--json`과 조합하지 않는다.

오류 형식:

```json
{"ok":false,"error":{"code":"INVALID_METADATA","message":"..."}}
```

주요 오류 코드: `INVALID_ARGUMENT`, `UNSUPPORTED_COMMAND`, `INVALID_CONFIG`, `INVALID_METADATA`, `INVALID_ARTICLE`, `INVALID_IMAGE`, `READ_FAILED`, `FILE_EXISTS`, `WRITE_FAILED`, `INTERNAL_ERROR`.

`plan`의 `ok: true`와 종료 코드 0은 계획을 정상 작성했다는 뜻이다. 대상 계정과 전송 승인을 받지 않는 오프라인 계획이므로 `ready: false`, 각 계획의 `canPublish`도 false다. 벨로그·티스토리·블로거는 `status: experimental`, KeyFlow는 `implemented`다. 공통 blocker는 `DESTINATIONS_REQUIRED`, `CONFIRM_REQUIRED`이며 플랫폼별 공개 상태·이미지 제약이 추가된다. 실제 전송은 [publish 명령](publish.md)의 대상 파일과 명시적 확인으로 진행한다. 계획 생성은 발행 성공을 의미하지 않는다. `preview --json`은 HTML을 `html` 필드에 담고, `--output`과 함께 쓰면 HTML 대신 출력 경로를 반환한다.

## 검증 범위

`bun run check`는 빌드된 CLI를 Node로 실행해 검사한다. 오프라인 핵심 검사에서는 fetch·HTTP·소켓 연결을 차단한다. 잘못된 메타데이터, 설정 우선순위, 원고 이동·이미지 변경 해시, 파일 충돌, 경로 탈출, HTML 이스케이프, 결과 JSON과 종료 코드를 확인한다. 실제 플랫폼 로그인·발행·수정 검증은 이 단계에 포함하지 않는다.
