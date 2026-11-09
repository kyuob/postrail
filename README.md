# Postrail

Write once. Publish across your blogs.

Postrail is an open-source CLI project targeting **Velog, Tistory, KeyFlow, and Google Blogger**.

> **Status: offline CLI + KeyFlow adapter.** Initialize a project, validate Markdown articles, render local previews, and inspect publishing plans. KeyFlow is accepted by the user based on the existing skill workflow and the scoped private-draft test; additional KeyFlow acceptance testing is closed. Velog, Tistory, and Blogger publishing are not implemented yet. No package has been released to a registry.

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

## Planned Google Blogger connection

Use target ID `blogger` in project settings, article metadata, and `plan --to blogger`. See the [Blogger integration plan](docs/blogger.md) and [example article](examples/blogger.md). This is target registration and planning only; Google OAuth and the Blogger API adapter are not implemented.

## Planned interface

The following is a design proposal, **not an available command**:

```sh
postrail publish article.md --to velog,tistory,keyflow,blogger
```

마크다운 하나로 여러 블로그에 발행하는 CLI입니다. KeyFlow는 기존 스킬 활용과 비공개 초안 실검증을 바탕으로 사용자 확정한 연동이며 추가 검증은 종료했습니다. 벨로그·티스토리·구글 블로거도 대상으로 등록돼 있으나 발행 어댑터는 미구현입니다.

## Roadmap

- [x] Standalone CLI scaffold and GitHub CI
- [x] Inspect two publishing references per platform for Velog and Tistory
- [ ] Confirm each platform's supported publishing and authentication methods
- [x] Define Markdown input and article metadata
- [ ] Implement per-platform adapters with explicit capability reporting
- [x] KeyFlow adapter accepted by the user; additional acceptance testing closed
- [x] Google Blogger target registration and official API/OAuth roadmap (adapter pending)
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
