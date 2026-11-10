# npm 공개 준비와 검수

사용자가 `@kyuob/postrail` 공개를 승인해 v0.1.3부터 `private:false`, `publishConfig.access:public`과 공식 npm 레지스트리를 명시했다. **설정 변경은 공개 완료가 아니다.** 공개 전에는 계정 인증과 범위 소유권을 확인한다. 실제 계정명이 다르면 이름부터 확정하고 문서·검사·패키지를 함께 바꾼다. 비밀번호·토큰·OTP는 저장소·채팅·검수 로그에 넣지 않는다. 공개 여부는 [npm 패키지 페이지](https://www.npmjs.com/package/@kyuob/postrail)와 아래 registry 검수 결과로 판단한다.

## 관리자 배포 순서

1. 공식 npm 웹사이트에서 계정과 이메일 인증을 준비하고 해당 범위의 공개 권한을 확인한다.
2. 정상 브라우저 인증으로 로그인한 뒤 `bun pm whoami`로 계정명만 확인한다. 다른 모듈의 자격증명은 읽지 않는다.
3. 회귀·문서·패키지·격리 전역 설치와 `node scripts/publish-dry-run.mjs`를 검사한다. dry-run은 npm에 쓰지 않는다.
4. 독립 검토와 정확한 배포 커밋의 CI를 확인한다. 깨끗한 커밋에서 생성해 설치 검사를 통과한 tarball만 공개 대상으로 보존한다.
5. 승인된 범위·버전을 다시 확인한 뒤 `bun publish ./tested-package.tgz --access=public --registry=https://registry.npmjs.org/`를 실행한다. 브라우저 인증·2FA가 필요하면 사용자가 직접 완료한다. 토큰을 요구하거나 자동 재시도하지 않는다.
6. `node scripts/verify-npm.mjs ./tested-package.tgz`로 공식 registry의 이름·버전·기본 latest·SHA512와 로컬 파일의 바이트 일치를 확인한다.
7. `node scripts/package-smoke.mjs --registry`로 공개 버전의 별도 소비자 설치·실행·격리 전역 설치·삭제를 확인한다. 실제 사용자 전역 설치는 변경하지 않는다.

## 사용자 설치 경로 · 공개 확인 후 사용

```sh
bun add -g @kyuob/postrail --ignore-scripts
postrail --version
postrail --help
```

이 명령은 registry에 공개된 뒤에만 작동한다. 인증 대기 중에는 [GitHub 릴리스 설치](installation.md)를 사용한다. 이름이 같은 다른 프로젝트의 unscoped `postrail` 패키지는 설치하지 않는다.

소스 공개·GitHub 릴리스·npm 공개·실제 블로그 전송은 각각 별개 상태다. 복구 기능은 [이력 대조 가이드](recovery.md)의 제한을 따른다.
