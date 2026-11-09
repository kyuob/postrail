---
id: postrail-first-article
title: Postrail로 첫 글 준비하기
tags: [개발, CLI]
visibility: draft
targets: [velog, tistory, keyflow]
---

## Markdown 하나로 준비하는 블로그 글

지금은 로컬 검증과 미리보기 단계입니다. 이 예제를 실행해도 블로그에 글이 올라가지 않습니다.

```js
const message = "안녕하세요, Postrail!";
console.log(message);
```

| 명령 | 역할 |
| --- | --- |
| validate | 원고 정보와 이미지 경로 확인 |
| preview | HTML 미리보기 만들기 |
| plan | 플랫폼별 전송 가능 상태 확인 |

[Postrail 저장소](https://github.com/kyuob/postrail)에서 개발 상황을 볼 수 있습니다.

> 원고의 `id`는 파일 이름을 바꿔도 유지하세요.
