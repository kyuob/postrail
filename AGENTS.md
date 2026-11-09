# Postrail

Standalone open-source Markdown publishing CLI targeting Velog, Tistory, and KeyFlow. Do not import code or configuration from sibling MyApp projects.

- Use Bun for dependencies and development commands. The built CLI runs on Node.js 22+.
- Run `bun run check` before proposing or committing a change.
- Offline init/validate/preview/plan and experimental KeyFlow check/login/push/status commands exist. KeyFlow real-account verification is pending; Velog/Tistory publishing is not implemented. Keep capability claims honest.
- KeyFlow integration must use the pinned official CLI, preserve original articles, sanitize subprocess output, require explicit named accounts and upload confirmation, and block unresolved writes. No live login/upload tests without an approved account and exact content.
- Markdown raw HTML stays disabled, previews must not fetch external images, and local image paths must remain within the article directory. Plan/validate never write files or read credentials.
- Confirm each platform's supported interface before implementing an adapter; document unsupported capabilities explicitly.
- Credentials and browser sessions belong in user-controlled secure storage, never repository files or logs.
- Publishing an article, releasing a package, and pushing code are separate actions requiring explicit user authorization.
