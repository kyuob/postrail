# Postrail

Write once. Publish across your blogs.

Postrail is an open-source CLI project targeting **Velog, Tistory, KeyFlow, and Google Blogger**.

> **Status: offline CLI + KeyFlow + experimental Velog/Tistory/Blogger adapters.** KeyFlow is accepted by the user; additional acceptance testing is closed. The other adapters are fixture-tested with bundled live account validation pending. Tistory draft slots, Blogger private posts and Blogger local image uploads are unsupported. No package has been released to a registry.

## Development

Requires [Bun](https://bun.sh/) 1.3+ for development and Node.js 22+ for the built CLI.

```sh
bun install --frozen-lockfile
bun run dev --help
bun run check
node dist/cli.js --version
node dist/cli.js validate examples/article.md
node dist/cli.js preview examples/article.md --output preview.html
node dist/cli.js plan examples/article.md --to velog,tistory,keyflow,blogger --json
```

`bun run check` builds the CLI and runs Node-based CLI tests, including offline behavior, metadata validation, preview rendering, and file protection. Markdown and YAML parsers are pinned in `bun.lock`.

## Available commands

- `init`: create `postrail.json` in the current directory without overwriting files.
- `validate <article.md>`: validate YAML frontmatter, body, targets, and local images.
- `preview <article.md> [--output <new.html>]`: produce offline HTML with embedded local images; external images are omitted and raw HTML is escaped.
- `plan <article.md> [--to velog,tistory,keyflow,blogger]`: inspect requested targets and their adapter limitations.

All four commands support `--json`. See the [offline CLI guide](docs/offline-cli.md) for the article format, limits, configuration precedence, and exit codes. A successful plan means the plan was created; it does not mean publishing is available.

## KeyFlow adapter

`node dist/cli.js keyflow check examples/article.md --json` runs the pinned official CLI's actual offline dry-run. Explicit `keyflow login`, `keyflow push --account <name> --confirm`, and local `keyflow status` commands are also implemented. Uploads preserve the source article, keep a local post ID journal, and block automatic retry after an uncertain result. See the [KeyFlow guide](docs/keyflow.md) before using commands that authenticate or send content.

See [live acceptance results and limits](docs/live-validation.md) for the scoped test facts. Per the user's decision, additional KeyFlow verification is not a remaining project gate. This acceptance does not invent tests for other features; the multi-platform publish command is still unimplemented.

## Experimental Google Blogger adapter

Run `node dist/cli.js blogger check examples/blogger.md --json` offline. `blogger login --account NAME --client-config /outside/repo/desktop-client.json` uses system-browser Google consent, PKCE and a loopback callback. `blogs` lists ADMIN blog IDs. `push ARTICLE --account NAME --blog-id ID --confirm` creates a draft, reads it back, and publishes only for explicit public input. Updates use the saved ID and PATCH; `get` checks it remotely and `status` is local. Read the [Blogger guide](docs/blogger.md) for setup, private credential storage, state transitions and limitations. Windows authentication is unsupported. `bun run check:blogger` runs core and the three experimental adapters' fixtures; it does not access real Google credentials or accounts.

## Experimental Velog adapter

Run `node dist/cli.js velog check examples/velog.md --json` offline. Explicit `velog login --account USERNAME` uses a dedicated Chrome profile; `velog push ARTICLE --account USERNAME --confirm` sends the source's declared visibility. `status` reads only the local journal; `get` reads the saved remote ID. Original Markdown and images are preserved. Uncertain writes and remote edits block automatic resubmission. Read the [Velog guide](docs/velog.md) before authentication or upload. Run `bun run check:velog` for offline core and Velog fixture checks; these do not validate a real account.

## Experimental Tistory adapter

`node dist/cli.js tistory check examples/tistory.md --json` runs offline. Explicit `tistory login --blog NAME --blog-id ID` opens a dedicated Chrome profile. `tistory push ARTICLE --blog NAME --blog-id ID --confirm` creates or updates a saved post ID using Tistory's internal management interface. Markdown is rendered to HTML; uploads register platform attachment references. Draft input is rejected rather than converted to a private post. Read the [Tistory guide](docs/tistory.md) for exact commands, experimental schema limits and recovery. `bun run check:tistory` checks core, Velog and Tistory fixtures without account access. See the [bundled live validation plan](docs/bundled-validation.md) for the deferred account stage.

## Planned interface

The following is a design proposal, **not an available command**:

```sh
postrail publish article.md --to velog,tistory,keyflow,blogger
```

마크다운 하나로 여러 블로그에 발행하는 CLI입니다. KeyFlow는 사용자 확정으로 추가 검증을 종료했습니다. 벨로그·티스토리·블로거의 실험적 어댑터와 모의 응답 검사를 마련했으며, 다음은 묶음 실계정 검증입니다. 티스토리 임시저장, 블로거 개별 비공개 글·로컬 이미지 업로드와 공통 다중 발행은 미지원입니다.

## Roadmap

- [x] Standalone CLI scaffold and GitHub CI
- [x] Inspect two publishing references per platform for Velog and Tistory
- [ ] Confirm each platform's supported publishing and authentication methods
- [x] Define Markdown input and article metadata
- [ ] Implement per-platform adapters with explicit capability reporting
- [x] KeyFlow adapter accepted by the user; additional acceptance testing closed
- [x] Experimental Blogger Desktop OAuth and official API adapter (live validation pending)
- [x] Offline preview and publishing plan with explicit adapter status
- [ ] Track publication results to support updates without duplicate posts
- [ ] Document installation and publish the first usable release

Platform support is a goal, not a claim that every platform currently exposes a suitable public API. Document limitations before implementing a connector.

See the [implementation roadmap](docs/roadmap.md) and [source reference assessment](docs/references.md) for remaining adapter work. KeyFlow acceptance is settled; development continues on the remaining platforms and common publishing workflow.

## Contributing

Issues and pull requests are welcome. Keep changes focused, run `bun run check`, and never commit credentials, browser sessions, or personal drafts. Describe the problem and how you verified the change in your pull request.

## License

[MIT](LICENSE) © 2026 Postrail contributors.

Bundled dependency licenses are preserved in [third-party notices](docs/third-party-notices.md).
