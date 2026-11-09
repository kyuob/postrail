# Postrail

Standalone open-source Markdown publishing CLI targeting Velog, Tistory, KeyFlow, and Google Blogger (target ID: blogger). Do not import code or configuration from sibling MyApp projects.

- Use Bun for dependencies and development commands. The built CLI runs on Node.js 22+.
- Run `bun run check` before proposing or committing a change.
- Offline init/validate/preview/plan and KeyFlow check/login/push/status commands exist. KeyFlow is accepted by the user based on their existing skill workflow and scoped private-draft evidence. Additional KeyFlow acceptance verification is closed and is not a release blocker. Preserve historical test facts without claiming unperformed tests. Velog/Tistory/Blogger publishing is not implemented.
- Do not initiate further KeyFlow-specific checks, live/proof tests or authentication unless the user explicitly reopens that work. Use bun run check:offline for other platform target changes; keep existing automatic regression CI intact.
- KeyFlow integration must use the pinned official CLI, preserve original articles, sanitize subprocess output, require explicit named accounts and upload confirmation, and block unresolved writes. No live login/upload tests without an approved account and exact content.
- Markdown raw HTML stays disabled, previews must not fetch external images, and local image paths must remain within the article directory. Plan/validate never write files or read credentials.
- Confirm each platform's supported interface before implementing an adapter; document unsupported capabilities explicitly.
- Credentials and browser sessions belong in user-controlled secure storage, never repository files or logs.
- Publishing an article, releasing a package, and pushing code are separate actions requiring explicit user authorization.
