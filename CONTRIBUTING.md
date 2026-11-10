# Contributing

Focused fixes, documentation improvements and reproducible bug reports are welcome. Read the [support matrix](docs/support.md) before assuming a platform or visibility is supported.

## Development

Use Node.js 22+ and Bun 1.3+. Install with `bun install --frozen-lockfile --ignore-scripts` and build with `bun run build`. Use existing conventions; avoid unrelated cleanup and new dependencies for small changes.

- `bun run check:publish`: core, Velog/Tistory/Blogger and common orchestration regressions, without real credentials or extra KeyFlow-specific checks.
- `bun run check:docs`: local Markdown links, examples and documented CLI command shapes.
- `bun run check:package`: creates a local archive, inspects its contents, installs it in a clean consumer directory and exercises the installed offline CLI. It may download public dependencies; it does not publish a package or authenticate.
- `bun run check:offline`: smallest core-only regression suite.
- Existing CI runs the repository's full established regression suite. Adding or running new KeyFlow-specific acceptance/authentication/live checks requires separate scope approval.

Tests use fake articles and injected transports. Never add personal credentials, browser sessions, real target IDs or private post contents to fixtures. Never use an external contributor's CI run to access an account. Do not run platform login, push, publish, delete or live checks as part of ordinary tests.

## Pull requests

Describe the concrete problem, resulting behavior, verification and remaining limits. Include a small before/after example where helpful. A UI screenshot is useful only when it does not expose personal content or account details. Preserve source articles and existing journals.

Authentication, permissions, remote writes, image references and state recovery need particular care. Keep exact account/blog ownership checks, unknown-write protection, destination allowlists and explicit confirmation. Do not introduce automatic login, fallback mutation schemas, stealth settings, cookie extraction or implicit privacy conversion. A missing remote article does not authorize recreation.

## Reporting problems

Use the bug template with version/OS/runtime, a fixed error code and a fake reproducer. Do not include entire environment dumps, magic links, OAuth files, tokens, signed image URLs, browser profiles or personal Markdown. Security-sensitive reports follow [SECURITY.md](SECURITY.md).

Documentation changes should keep English and [Korean onboarding](README.ko.md) aligned. Explain observed behavior without turning a hypothesis into a confirmed cause. Each release requires separate approval, exact-commit CI and registry verification; a version bump or GitHub push does not prove npm publication.
