# Postrail

Standalone open-source Markdown publishing CLI targeting Velog, Tistory, and KeyFlow. Do not import code or configuration from sibling MyApp projects.

- Use Bun for dependencies and development commands. The built CLI runs on Node.js 22+.
- Run `bun run check` before proposing or committing a change.
- Offline init/validate/preview/plan commands exist; authentication and publishing are not implemented. Keep capability claims honest.
- Markdown raw HTML stays disabled, previews must not fetch external images, and local image paths must remain within the article directory. Plan/validate never write files or read credentials.
- Confirm each platform's supported interface before implementing an adapter; document unsupported capabilities explicitly.
- Credentials and browser sessions belong in user-controlled secure storage, never repository files or logs.
- Publishing an article, releasing a package, and pushing code are separate actions requiring explicit user authorization.
