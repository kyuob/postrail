# 발행 결과 진단과 로컬 이력 대조

v0.1.3 소스에서는 Velog에 이어 Tistory와 Blogger도 `inspect`와 `reconcile`을 제공한다. 원격 글을 다시 만들거나 고치는 명령이 아니다. 저장된 ID를 조회해 결과를 확인하고, 검토한 결과에 맞춰 로컬 `pending`/`unknown`만 정리한다. KeyFlow는 원격 조회·충돌 확인이 없어 미지원이다.

## 순서

먼저 실제 발행에 사용한 원고·이미지·프로젝트의 `.postrail/`을 보존한다. 기존 잠금이 남아 있다면 실행 중인 프로세스와 원격 결과부터 확인한다. 도구는 잠금을 자동 삭제하지 않는다. 저장 ID가 없는 경우 검색·새 글 생성으로 대신하지 않는다.

```sh
postrail tistory inspect ./article.md --blog BLOG --blog-id ID --json
postrail blogger inspect ./article.md --account ACCOUNT --blog-id ID --json
```

`inspect`는 소유 계정·대상 블로그·저장 ID를 확인하고 원고 지문, 제목, 본문, 태그, 공개 상태, 이미지를 비교한다. 글과 발행 이력은 변경하지 않는다. 일반 인증 세션의 갱신·브라우저 프로필 저장은 일어날 수 있다. 출력의 `canReconcile`, 차이, `reviewHash`를 검토한다. Tistory에서는 현재 분류·주소 슬러그·편집 옵션도 표시하고 보존한다.

원고·본문·공개 상태·이미지가 모두 일치하고 태그만 다르다면 그 차이를 수용할지 직접 결정한다. 지원하지 않는 형식이나 이미지 검증 실패는 태그 승인으로 우회할 수 없다.

```sh
postrail tistory reconcile ./article.md --blog BLOG --blog-id ID --review REVIEW_HASH --confirm --json
postrail blogger reconcile ./article.md --account ACCOUNT --blog-id ID --review REVIEW_HASH --confirm --json
```

태그 차이를 검토하고 수용한 경우에만 `--accept-tags`를 추가한다. 글 쓰기·재업로드·재시도는 하지 않는다. `reconcile`은 잠금을 획득하고 최신 원격 상태를 다시 읽는다. 검토 이후 원고·로컬 기록·원격 상태가 바뀌었으면 중단한다. 기존 기록의 바이트를 개인 백업으로 보존·동기화한 뒤 이력을 원자적으로 교체한다. 백업은 원래 `state.json` 옆의 `.backup-지문.json` 파일이다. 사용자 본문과 이미지 URL 등은 출력에 넣지 않는다.

## 대상 목록과 이후 전송

복구는 기본적으로 원고·설정에 선언된 원래 대상 목록으로 원고 지문을 확인한다. 과거 명령에서 대상을 바꿨다면 원래 순서대로 `--published-to velog,tistory` 같은 옵션을 두 명령에 동일하게 전달한다. 목록에는 복구할 플랫폼이 포함돼야 한다. 단일 플랫폼 지문도 기존 형식 그대로 인정한다. 원문을 바꿔서 지문을 억지로 맞추지 않는다.

이력을 대조한 뒤에도 다음 전송은 원격 변경을 먼저 확인한다. 원고가 그대로라면 별도로 보존한 플랫폼 지문으로 중복 전송을 건너뛴다. 원격에서 다른 수정이 일어났다면 충돌로 중단한다.

## 플랫폼별 제한

- Tistory: private/public만 지원한다. 로컬 이미지 치환자를 엄격히 복원하고 전체 본문 일치를 확인한 뒤 `blog.kakaocdn.net`의 고정 CDN 경로만 읽는다. 인증 정보를 보내지 않으며 리다이렉트·시간·바이트 제한을 적용한다. 원본 바이트가 다르거나 URL이 만료되면 대조를 거절한다.
- Blogger: ADMIN 권한과 기존 사용자 ID·blogId를 요구한다. draft/public만 지원하며 로컬 이미지는 미지원이다. 원격 이미지 URL은 본문에 그대로 일치해야 하지만 이미지 파일 자체를 다운로드해 검사하지 않는다.
- 새 기능은 합성 응답·격리된 로컬 기록으로 검증했다. 실제 사용자 이력이나 원격 글을 이 작업에서 복구하지 않았다. 기존 실제 발행 증거를 복구 기능의 실계정 검증으로 확대하지 않는다.

Velog의 세부 명령은 [Velog 가이드](velog.md), 전체 제약은 [지원표](support.md)를 참고한다.
