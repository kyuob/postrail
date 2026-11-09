# Postrail

Write once. Publish across your blogs.

Postrail is an open-source CLI project for publishing Markdown articles to **Velog, Tistory, and KeyFlow**.

> **Status: initial scaffold.** The CLI currently supports help and version output. Platform authentication and publishing are not implemented yet. No package has been released to a registry.

## Development

Requires [Bun](https://bun.sh/) 1.3+ for development and Node.js 22+ for the built CLI.

```sh
bun install
bun run dev --help
bun run check
node dist/cli.js --version
```

The project has no third-party dependencies. `bun run check` builds the CLI and checks its executable help, version, and failure behavior.

## Planned interface

The following is a design proposal, **not an available command**:

```sh
postrail publish article.md --to velog,tistory,keyflow
```

마크다운 하나로 여러 블로그에 발행하는 CLI입니다. 현재는 프로젝트 초기 구성 단계이며, 실제 로그인·글 발행 기능은 아직 제공하지 않습니다.

## Roadmap

- [x] Standalone CLI scaffold and GitHub CI
- [ ] Confirm each platform's supported publishing and authentication methods
- [ ] Define Markdown input and article metadata
- [ ] Implement per-platform adapters with explicit capability reporting
- [ ] Preview and dry-run before publishing
- [ ] Track publication results to support updates without duplicate posts
- [ ] Document installation and publish the first usable release

Platform support is a goal, not a claim that every platform currently exposes a suitable public API. Document limitations before implementing a connector.

## Contributing

Issues and pull requests are welcome. Keep changes focused, run `bun run check`, and never commit credentials, browser sessions, or personal drafts. Describe the problem and how you verified the change in your pull request.

## License

[MIT](LICENSE) © 2026 Postrail contributors.
