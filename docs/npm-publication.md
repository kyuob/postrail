# npm 공개 상태와 검수

2026-11-10에 [공식 registry 메타데이터](https://registry.npmjs.org/@kyuob%2Fpostrail)를 읽어 `@kyuob/postrail@0.1.3`의 실제 공개와 `latest:0.1.3`을 확인했다. 공개 시각은2026-11-10T12:40:54.791Z다. 당시 배포물은37파일·해제 후1,428,206바이트다. 설정만 보고 추정한 상태가 아니다. 현재 소스의 Unreleased 수정은 그 배포물에 포함되지 않는다.

registry에는2파일·337바이트의 `0.0.0-stage`도 있다. latest가 아니므로 일반 설치 대상으로 선택되지 않는다. 이 검수에서 삭제·사용 중단 표시는 하지 않았다. [npm 삭제 정책](https://docs.npmjs.com/policies/unpublish/)상72시간 이내에도 의존성 조건이 있고,72시간 이후에도 의존성·다운로드·소유자 조건을 충족하면 삭제할 수 있다. 따라서 ‘72시간 이후에는 반드시 deprecate’라는 규칙은 쓰지 않는다. 삭제는 되돌릴 수 없으며 해당 버전 번호를 다시 쓸 수 없으므로 별도 명시 승인과 실행 직전 조건 확인이 필요하다.

다음 릴리스는 계정 인증·범위 소유권·변경된 배포 파일 목록을 확인한 뒤 별도 승인으로 진행한다. 비밀번호·토큰·OTP를 저장소·채팅·검수 로그에 넣지 않는다. 소스 변경만으로 공개 배포물을 바꾸거나 새 버전을 공개하지 않는다.

## 관리자 배포 순서

1. 공식 npm 웹사이트에서 계정과 이메일 인증을 준비하고 해당 범위의 공개 권한을 확인한다.
2. 정상 브라우저 인증으로 로그인한 뒤 `bun pm whoami`로 계정명만 확인한다. 다른 모듈의 자격증명은 읽지 않는다.
3. 회귀·문서·패키지·격리 전역 설치와 `node scripts/publish-dry-run.mjs`를 검사한다. dry-run은 npm에 쓰지 않는다.
4. 독립 검토와 정확한 배포 커밋의 CI를 확인한다. 깨끗한 커밋에서 생성해 설치 검사를 통과한 tarball만 공개 대상으로 보존한다.
5. 승인된 범위·버전을 다시 확인한 뒤 `bun publish ./tested-package.tgz --access=public --registry=https://registry.npmjs.org/`를 실행한다. 브라우저 인증·2FA가 필요하면 사용자가 직접 완료한다. 토큰을 요구하거나 자동 재시도하지 않는다.
6. `node scripts/verify-npm.mjs ./tested-package.tgz`로 공식 registry의 이름·버전·기본 latest·SHA512와 로컬 파일의 바이트 일치를 확인한다.
7. `node scripts/package-smoke.mjs --registry`로 공개 버전의 별도 소비자 설치·실행·격리 전역 설치·삭제를 확인한다. 실제 사용자 전역 설치는 변경하지 않는다.

## 사용자 설치 경로

```sh
bun add -g @kyuob/postrail --ignore-scripts
postrail --version
postrail --help
```

공개된0.1.3을 설치하는 명령이다. 다른 버전을 설치할 때는 먼저 registry 상태를 확인한다. [GitHub 릴리스 설치](installation.md)도 선택할 수 있다. 이름이 같은 다른 프로젝트의 unscoped `postrail` 패키지는 설치하지 않는다.

소스 공개·GitHub 릴리스·npm 공개·실제 블로그 전송은 각각 별개 상태다. 복구 기능은 [이력 대조 가이드](recovery.md)의 제한을 따른다.
