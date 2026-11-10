# Postrail

Write once. Publish across your blogs.

[한국어](README.ko.md) · [Installation](docs/installation.md) · [Login](docs/login.md) · [FAQ](docs/faq.md) · [Support matrix](docs/support.md)

Postrail is an open-source CLI project targeting **Velog, Tistory, KeyFlow, and Google Blogger**.

> **Status: offline CLI, per-platform adapters and experimental common publishing.** KeyFlow acceptance is closed. Per-adapter checks and common Velog/Tistory private + Velog/Blogger draft flows passed create, same-ID update, readback and unchanged-skip validation. Public publishing, visual rendering and remote OS-matrix results remain unverified. Tistory draft slots and Blogger private/local images are unsupported. No registry package has been released.

## Development

Requires [Bun](https://bun.sh/) 1.3+ for development and Node.js 22+ for the built CLI.

No registry package is released yet. Follow the [source/local-package installation guide](docs/installation.md); do not install an unrelated registry package by name. Velog/Tistory manual authentication currently supports macOS only.

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

See [live acceptance results and limits](docs/live-validation.md) for the scoped test facts. Additional KeyFlow verification is closed. The common publish command reuses the existing adapter without adding KeyFlow-specific verification.

## Experimental Google Blogger adapter

Run `node dist/cli.js blogger check examples/blogger.md --json` offline. `blogger login --account NAME --client-config /outside/repo/desktop-client.json` uses system-browser Google consent, PKCE and a loopback callback. `blogs` lists ADMIN blog IDs. `push ARTICLE --account NAME --blog-id ID --confirm` creates a draft, reads it back, and publishes only for explicit public input. Updates use the saved ID and PATCH; `get` checks it remotely and `status` is local. Read the [Blogger guide](docs/blogger.md) for setup, private credential storage, state transitions and limitations. Windows authentication is unsupported. `bun run check:blogger` runs core and the three experimental adapters' fixtures; it does not access real Google credentials or accounts.

## Experimental Velog adapter

Run `node dist/cli.js velog check examples/velog.md --json` offline. Explicit `velog login --account USERNAME` uses a dedicated Chrome profile; `velog push ARTICLE --account USERNAME --confirm` sends the source's declared visibility. `status` reads only the local journal; `get` reads the saved remote ID. Original Markdown and images are preserved. Uncertain writes and remote edits block automatic resubmission. Read the [Velog guide](docs/velog.md) before authentication or upload. Run `bun run check:velog` for offline core and Velog fixture checks; these do not validate a real account.

## Experimental Tistory adapter

`node dist/cli.js tistory check examples/tistory.md --json` runs offline. Explicit `tistory login --blog NAME --blog-id ID` opens ordinary Chrome in its dedicated profile on macOS. After login, quit that Chrome app to verify the saved blog session. `tistory push ARTICLE --blog NAME --blog-id ID --confirm` creates or updates a saved post ID using Tistory's internal management interface. Markdown is rendered to HTML; uploads register platform attachment references. Draft input is rejected rather than converted to a private post. Read the [Tistory guide](docs/tistory.md) for commands and recovery, and [actual validation results](docs/bundled-validation-results.md) for verified scope. `bun run check:tistory` checks fixtures without account access.

## Common publishing

Prepare a nonsecret destination mapping from [the example](examples/destinations.json), then review offline before sending:

```sh
node dist/cli.js publish article.md --to velog,blogger --destinations my-destinations.json --dry-run --json
node dist/cli.js publish article.md --to velog,blogger --destinations my-destinations.json --confirm --json
```

All selected targets pass offline capability checks before sequential sends. Results preserve partial success; per-platform journals block unresolved writes and remote conflicts. Read the [publish guide](docs/publish.md) for visibility compatibility, recovery and concurrency locks. `bun run check:publish` verifies common orchestration and the core/experimental adapters without real accounts or additional KeyFlow-specific tests.

마크다운 하나를 여러 블로그로 전송하는 공통 명령을 제공합니다. `--dry-run`으로 먼저 확인하고 `--confirm`으로 전송합니다. 플랫폼별 공개 상태 제약을 유지하며 불확실한 전송을 자동 재시도하지 않습니다. 개별 어댑터의 비공개·초안 실검증과 공통 명령의 모의 검사를 구분합니다.

## Roadmap

- [x] Standalone CLI scaffold and GitHub CI
- [x] Inspect two publishing references per platform for Velog and Tistory
- [x] Record each platform's supported interfaces and authentication limits
- [x] Define Markdown input and article metadata
- [x] Experimental per-platform adapters and explicit capability reporting
- [x] KeyFlow adapter accepted by the user; additional acceptance testing closed
- [x] Scoped real-account draft/private validation for Velog, Tistory and Blogger
- [x] Offline preview and publishing plan with explicit adapter status
- [x] Track remote IDs, same-post updates, partial results and uncertain writes
- [ ] Document installation and publish the first usable release

Platform support is a goal, not a claim that every platform currently exposes a suitable public API. Document limitations before implementing a connector.

See the [implementation roadmap](docs/roadmap.md) and [source reference assessment](docs/references.md) for remaining adapter work. KeyFlow acceptance is settled; development continues on the remaining platforms and common publishing workflow.

## Contributing

See [CONTRIBUTING](CONTRIBUTING.md), [SECURITY](SECURITY.md), [CHANGELOG](CHANGELOG.md) and the [stage7 verification record](docs/stage7-status.md). Never commit credentials, browser sessions or personal drafts. Describe the problem and the verification scope in your pull request.

## License

[MIT](LICENSE) © 2026 Postrail contributors.

Bundled dependency licenses are preserved in [third-party notices](docs/third-party-notices.md).
