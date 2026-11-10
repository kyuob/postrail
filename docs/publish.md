# Common publish command

`publish` sends one Markdown article through the existing platform adapters, sequentially. It does not log in automatically. Log in with each platform's command first, then review the article, visibility and exact destinations. Mocks cover partial results and guards; real common Velog/Tistory private and Velog/Blogger draft flows passed creation, same-ID update, readback and unchanged skip in [stage7](stage7-status.md). No new KeyFlow live action was performed. Public publishing and visual rendering remain unverified.

## Destinations

Copy [examples/destinations.json](../examples/destinations.json) to a local file and replace every selected account and blog ID. Keep only destinations you use. Accounts must match the separately saved sessions; Blogger's account is its local alias. Tistory requires the canonical subdomain and numeric blog ID. This file stores identifiers, not credentials. Tokens, passwords, cookies and OAuth JSON contents are rejected as unknown fields and must never be added.

```sh
# Offline review, with the example's declared draft visibility.
node dist/cli.js publish examples/blogger.md --to velog,blogger \
  --destinations ./my-destinations.json --dry-run --json

# Only after reviewing your own article, destinations and visibility:
node dist/cli.js publish ./my-article.md --to velog,blogger \
  --destinations ./my-destinations.json --confirm --json
```

`--config FILE` supplies the existing article defaults. `--to` overrides the article's targets; without it, frontmatter or project defaults apply. `--dry-run` reads only local files, validates all selected destinations and runs offline capability checks. It does not authenticate, call the official KeyFlow CLI, write journals or create locks. Even with `--confirm` present, `--dry-run` remains offline.

All capability checks finish before any selected target is sent. A missing destination, invalid source or unsupported visibility prevents the entire invocation from sending content. No visibility conversion is implicit: Tistory supports private/public but not draft slots; Blogger supports draft/public but not private posts or local image uploads. Thus no single visibility works across all four platforms except public, which requires explicit source intent and confirmation. Choose compatible subsets or separately reviewed source files instead of changing privacy automatically.

## Results and recovery

With confirmation, targets run in the selected order. JSON contains one result per target: `succeeded`, `skipped`, or `failed`. A failure has a sanitized `error.code` and `automaticRetry: false`; arbitrary server error text is withheld. Exit status is 1 if preflight is blocked or any target fails, and 0 if all selected targets succeed or skip unchanged content.

Success on one target is retained when another fails. The command does not roll back, delete, log in again, retry a write or try another mutation schema. Each adapter keeps its existing account/blog/article journal and remote ID. Velog/Tistory/Blogger check remote content before skipping unchanged input and stop on detected remote edits. KeyFlow skips from its local hash and does not detect remote manual edits; updates can overwrite them, and remote `get` is unavailable. An unknown write stays blocked until the remote result is reconciled. Inspect platform `status` and supported `get` commands or the service's own management screen, then retry only resolved targets with `--to`. A user-deleted remote article is not silently recreated.

Common invocations lock the article ID inside `.postrail/publish/` for their entire execution. Per-platform locks still protect individual writes, including direct platform commands. A crashed common invocation leaves its lock in place. Stop any active process and inspect every affected journal before manually removing an abandoned lock; the CLI never assumes an old lock is safe to remove. This is duplicate prevention, not an exactly-once guarantee.

## 한국어 요약

대상 계정 파일을 별도로 지정하고 `--dry-run`으로 먼저 확인한 뒤 `--confirm`으로 전송합니다. 모든 대상의 오프라인 검사가 통과해야 전송을 시작하며, 일부 실패해도 이미 성공한 플랫폼의 결과는 유지합니다. 불확실한 전송은 자동 재시도하지 않습니다. 원고의 공개 상태를 바꾸거나 실제 공개 발행하는 승인은 이 명령의 구현·모의 검사와 별개입니다.
