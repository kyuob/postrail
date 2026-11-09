# Postrail

Write once. Publish across your blogs.

Postrail is an open-source CLI project for publishing Markdown articles to **Velog, Tistory, and KeyFlow**.

> **Status: offline CLI + experimental KeyFlow adapter.** Initialize a project, validate Markdown articles, render local previews, and inspect publishing plans. KeyFlow check/login/upload integration is implemented and tested offline; real-account validation is still pending. Velog and Tistory publishing are not implemented yet. No package has been released to a registry.

## Development

Requires [Bun](https://bun.sh/) 1.3+ for development and Node.js 22+ for the built CLI.

```sh
bun install --frozen-lockfile
bun run dev --help
bun run check
node dist/cli.js --version
node dist/cli.js validate examples/article.md
node dist/cli.js preview examples/article.md --output preview.html
node dist/cli.js plan examples/article.md --to velog,tistory,keyflow --json
```

`bun run check` builds the CLI and runs Node-based CLI tests, including offline behavior, metadata validation, preview rendering, and file protection. Markdown and YAML parsers are pinned in `bun.lock`.

## Available commands

- `init`: create `postrail.json` in the current directory without overwriting files.
- `validate <article.md>`: validate YAML frontmatter, body, targets, and local images.
- `preview <article.md> [--output <new.html>]`: produce offline HTML with embedded local images; external images are omitted and raw HTML is escaped.
- `plan <article.md> [--to velog,tistory,keyflow]`: report the requested targets as unverified and unavailable for publishing.

All four commands support `--json`. See the [offline CLI guide](docs/offline-cli.md) for the article format, limits, configuration precedence, and exit codes. A successful plan means the plan was created; it does not mean publishing is available.

## Experimental KeyFlow adapter

`node dist/cli.js keyflow check examples/article.md --json` runs the pinned official CLI's actual offline dry-run. Explicit `keyflow login`, `keyflow push --account <name> --confirm`, and local `keyflow status` commands are also implemented. Uploads preserve the source article, keep a local post ID journal, and block automatic retry after an uncertain result. See the [KeyFlow guide](docs/keyflow.md) before using commands that authenticate or send content.

## Planned interface

The following is a design proposal, **not an available command**:

```sh
postrail publish article.md --to velog,tistory,keyflow
```

마크다운 하나로 여러 블로그에 발행하는 CLI입니다. 원고 검증·로컬 미리보기·발행 계획과 실험적 KeyFlow 연동을 제공합니다. KeyFlow 실계정 검증은 아직 진행하지 않았으며 벨로그·티스토리 발행은 미구현입니다.

## Roadmap

- [x] Standalone CLI scaffold and GitHub CI
- [x] Inspect two publishing references per platform for Velog and Tistory
- [ ] Confirm each platform's supported publishing and authentication methods
- [x] Define Markdown input and article metadata
- [ ] Implement per-platform adapters with explicit capability reporting
- [x] Experimental KeyFlow adapter with official offline contract tests (live verification pending)
- [x] Offline preview and publishing plan (all adapters remain unverified)
- [ ] Track publication results to support updates without duplicate posts
- [ ] Document installation and publish the first usable release

Platform support is a goal, not a claim that every platform currently exposes a suitable public API. Document limitations before implementing a connector.

See the [implementation roadmap](docs/roadmap.md) and [source reference assessment](docs/references.md) for staged acceptance criteria and current integration limitations. Source inspection is complete; live platform verification is still pending.

## Contributing

Issues and pull requests are welcome. Keep changes focused, run `bun run check`, and never commit credentials, browser sessions, or personal drafts. Describe the problem and how you verified the change in your pull request.

## License

[MIT](LICENSE) © 2026 Postrail contributors.

Bundled dependency licenses are preserved in [third-party notices](docs/third-party-notices.md).
