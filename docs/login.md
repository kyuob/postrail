# 플랫폼별 로그인

[설치](installation.md) · [FAQ](faq.md) · [지원 범위](support.md)

인증은 본인 브라우저에서 직접 완료한다. 비밀번호·토큰·쿠키·OAuth JSON 내용을 채팅, GitHub 이슈, 대상 설정 파일에 넣지 않는다. 로그인 자체는 글 전송을 승인하거나 수행하지 않는다.

## Velog

1. 프로필 주소의 사용자명을 확인한다. `https://velog.io/@YOUR_USERNAME/posts`에서 `YOUR_USERNAME` 부분이며 이메일이나 표시 이름이 아니다.
2. `postrail velog login --account YOUR_USERNAME`을 실행한다.
3. 새로 열린 일반 Chrome의 Postrail 전용 프로필에서 로그인한다. 이미 연결한 Google/GitHub 계정이 있으면 해당 공식 버튼을 사용할 수 있다. 제공자가 허용한다고 보장하지는 않는다.
4. 올바른 Velog 계정으로 로그인된 화면을 확인한다.
5. **새 전용 Chrome 앱을 ⌘Q로 완전히 종료**한다. 창의 닫기 버튼만 누르면 프로세스가 남을 수 있다.
6. 터미널의 `velog login: complete.`를 확인한다. CLI는 저장된 프로필의 사용자명이 요청한 값과 일치하는지 확인한다.

평소 Chrome과 별도로 보이는 이유는 전용 프로필을 쓰기 때문이다. 기존 Chrome의 쿠키를 읽거나 복사하지 않는다. 로그인 창은 Playwright로 제어하지 않으며 시간 제한으로 닫지 않는다. 종료 후에만 백그라운드 계정 확인을 수행한다.

처음 연결하는 경우 해당 프로필에서 로그인을 해야 한다. 평소 Chrome에 로그인돼 있어도 전용 프로필의 인증을 대신하지 않는다. 이메일 링크 404가 발생하면 같은 링크를 반복 입력하지 말고 [문제 해결](faq.md)을 따른다.

## Tistory

1. 본인 블로그의 canonical 주소와 숫자 blogId를 확인한다. `https://YOUR_BLOG.tistory.com`에서 `YOUR_BLOG`를 사용한다.
2. 숫자 blogId는 본인 관리 편집기 HTML의 `window.Config.blog.blogSettings.blogId` 값이다. 관리자 화면의 페이지 소스에서 `blogId`를 검색해 확인한다. 임의의 공개 글 번호나 광고 ID를 쓰지 않는다. 전체 HTML을 이슈로 보내지 않는다.
3. `postrail tistory login --blog YOUR_BLOG --blog-id YOUR_NUMERIC_ID`를 실행한다.
4. 카카오 인증을 완료하고 **티스토리로 돌아와 `https://YOUR_BLOG.tistory.com/manage` 관리 화면**에 들어간다. 카카오 로그인 완료만으로 끝내지 않는다.
5. 글 목록·관리 메뉴와 본인 블로그를 확인한 뒤 **전용 Chrome 앱을 ⌘Q로 종료**한다.
6. `tistory login: complete.`를 확인한다. 요청한 호스트와 숫자 blogId가 일치해야 한다.

세션 쿠키가 Chrome 재실행 때 사라지는 문제를 줄이도록 수동·백그라운드 실행에 정상 세션 복원 옵션을 적용했다. 이전 탭이 복원될 수 있다. 인증 만료·추가 확인·CAPTCHA는 자동 우회하지 않는다. 원격에서 요구하는 인증은 직접 완료해야 한다.

## Google Blogger

1. 본인 Google Cloud 프로젝트에서 Blogger API와 OAuth 동의 설정을 준비한다. OAuth 클라이언트 유형은 **Desktop app**이어야 한다. 프로젝트·조직 정책에 따라 사용할 수 없거나 별도 설정이 필요할 수 있다.
2. 다운로드한 JSON을 저장소 밖에 보관한다. macOS/Linux에서 해당 파일은 0600, 안전한 상위 폴더는 0700으로 제한한다. 필요하면 `chmod 600 /본인경로/desktop-client.json`을 직접 실행한다.
3. `postrail blogger login --account MY_ALIAS --client-config /본인경로/desktop-client.json`을 실행한다. `MY_ALIAS`는 이메일 대신 사용할 로컬 별칭이다.
4. 시스템 브라우저에서 본인 Blogger 계정으로 동의한다. Postrail의 localhost 콜백이 완료돼야 한다. 화면의 로그인 성공만 보고 중간에 창을 닫지 않는다.
5. `postrail blogger blogs --account MY_ALIAS --json`으로 ADMIN 블로그 목록을 확인한다. 출력의 숫자 blogId를 대상 설정 파일에 쓴다.

이후 사용할 때마다 같은 별칭과 정확한 blogId를 지정한다. 별칭은 최초 Blogger 사용자 ID에 묶이므로 다른 계정으로 덮어쓰지 않는다. API 키만으로 글을 쓰거나 다른 앱의 Firebase 자격증명을 재사용하지 않는다. AUTHOR만 있는 계정은 현재 지원하지 않는다.

Google이 동의를 차단하면 에러 종류를 확인한다. Desktop client, 동의 화면의 사용자 제한, 조직 정책, API 활성화 여부를 확인해야 하며 앱 차단을 우회하지 않는다. refresh token을 저장하므로 정상 갱신이 가능하면 매번 로그인하지 않지만, 실제 만료 후 갱신 시나리오는 아직 검증하지 않았다. 토큰 폐기·동의 철회·정책 변경 시 재인증이 필요할 수 있다.

공식 참고: [Blogger API 인증](https://developers.google.com/blogger/docs/3.0/using).

## KeyFlow

기존 [KeyFlow 가이드](keyflow.md)의 공식 CLI 로그인과 명시적 계정 이름을 그대로 사용한다. 이 문서 작업은 추가 인증·검증·전송을 수행하지 않는다. 계정 선택은 `postrail keyflow login --account MY_ACCOUNT`, 공통 대상 파일에는 같은 `account`를 사용한다.

## 저장 위치와 로그인 해제

Velog/Tistory의 세션은 사용자 홈의 `~/.postrail/velog-profiles/`, `~/.postrail/tistory-profiles/` 안에서 계정별 해시 경로로 분리한다. Blogger 토큰은 `~/.postrail/blogger-accounts/`의 권한 제한 JSON에 보관하며 OS Keychain 암호화 파일이라고 주장하지 않는다. 프로젝트의 `.postrail/` 전송 이력과 구분한다.

현재 공통 `logout` 명령은 없다. 계정 접근을 철회하려면 서비스의 공식 세션·연결 앱 관리 기능을 사용한다. 로컬 파일만 삭제해도 원격 권한이 철회된다고 보장하지 않는다. 실행 중인 Chrome/CLI를 중단하고, 원격 철회와 로컬 세션 정리를 각각 확인한다. 이력을 지워 재전송을 강제로 재개하지 않는다.
