# Postrail

Standalone open-source Markdown publishing CLI targeting Velog, Tistory, and KeyFlow. Do not import code or configuration from sibling MyApp projects.

- Use Bun for dependencies and development commands. The built CLI runs on Node.js 22+.
- Run `bun run check` before proposing or committing a change.
- Keep the initial scaffold's status honest: authentication and publishing are not implemented.
- Confirm each platform's supported interface before implementing an adapter; document unsupported capabilities explicitly.
- Credentials and browser sessions belong in user-controlled secure storage, never repository files or logs.
- Publishing an article, releasing a package, and pushing code are separate actions requiring explicit user authorization.
