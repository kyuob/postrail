# KeyFlow adapter

Postrail delegates to the official `@keyflow-blog/cli`, pinned to **2026.10.20** in package.json and bun.lock. Development installed it with Bun and skipped install hooks. This adapter does not implement authentication or private HTTP APIs itself. Postrail's own source Markdown is never passed to the upstream write command.

KeyFlow is accepted by the user based on their existing skill workflow. **Additional KeyFlow acceptance verification is closed and is not a remaining release gate.** The earlier approved test created one text-only private draft using an existing session, skipped unchanged content, and updated the same ID; the workspace and marker were checked in the browser. See [historical results and limits](live-validation.md). This decision does not invent test results for other features. Multi-platform `plan` reports `implemented` with `USE_KEYFLOW_SUBCOMMAND`; use the existing `keyflow push` route.

## Commands

The package has not been published to a registry. Build with `bun install --frozen-lockfile` and `bun run build`, then run from the project directory:

```sh
# Real official CLI dry-run; no authentication or upload.
node dist/cli.js keyflow check examples/article.md --json

# Human action: opens the official login browser and stores the named connection.
node dist/cli.js keyflow login --account YOUR_ACCOUNT

# Read only Postrail's local journal, without authentication or network.
node dist/cli.js keyflow status examples/article.md --account YOUR_ACCOUNT --json

# External write: review article, account and visibility before running.
node dist/cli.js keyflow push examples/article.md --account YOUR_ACCOUNT --confirm --json
```

`check`, `status`, and `push` accept `--config <file>` and `--json`. Interactive `login` only accepts `--account`; it does not accept `--json`. The explicit `keyflow` subcommand selects that target even if the source's default targets differ. Invalid source targets are still rejected.

Login is implemented as an interactive handoff to the pinned official CLI. It opens its PKCE/browser approval flow and owns session storage under `~/.keyflow/`. Postrail does not copy the browser cookie DB, read credential values, ask for passwords, or put credentials on command lines. Login and upload use a named account; an unknown name must fail upstream rather than silently use the default account. No global installation or automatic update command is invoked.

## Visibility contract

| Postrail source | Official status | Official visibility |
|---|---|---|
| draft | draft | private |
| private | published | private |
| public | published | public |

Public and private posts both require an explicit `--confirm` for each actual upload/update. Source visibility must be reviewed before running it. Private publication is different from a draft. Postrail does not silently switch states on an error.

The adapter creates a mode-0700 temporary directory, writes a converted frontmatter/body copy and mode-0600 snapshots of validated local images, and runs the official `push --dry-run --json`. It checks the reported status, visibility and image count before allowing a real push. Upstream may record `keyflow.id` in this temporary copy; the original article remains byte-for-byte untouched. Temporary files are removed after the command. A machine crash can leave working copies in the OS temporary directory; they may contain private article content and should be removed explicitly after inspecting the upload outcome.

## Images and input limits

Postrail's existing image and metadata limits apply first. Simple inline local image syntax is supported, including URI-encoded spaces. Local image bytes already read and validated by Postrail are copied into the temporary directory; upstream never needs the original image files. External images remain external URLs and are not fetched by the local offline check; the remote service's rendering behavior is outside that check.

The official CLI's local-image collector and Postrail's Markdown parser must agree on the number and sources of every local image occurrence. If they differ, the adapter stops before spawning the upstream command. Local reference-style images, some complex Markdown image syntax, and escaped examples that the upstream collector mistakes for images are currently rejected with `KEYFLOW_UNSUPPORTED_IMAGE_SYNTAX`. Rewrite these as simple inline images for this adapter. Leading `#` tags are rejected because the official parser would silently normalize them. Core offline validation/preview still supports reference images.

No scheduler, HTML artifact, series, cover, translation, arbitrary server URL, or remote post lookup is exposed by this adapter. These are separate future capability decisions.

## Identity, updates and uncertainty

State lives under the current project's ignored `.postrail/keyflow/<hash>/state.json`, keyed by stable article ID and explicit account name. Keep this directory when moving the project. A different working directory is a different journal; losing the journal can cause a new post. Back up this local state before reinstalling or reorganizing a project. Do not delete it just to retry.

- Before a live child can start, Postrail records `pending`. The journal is written through a synced temporary file and rename; one operation lock protects each article/account pair.
- A complete, expected official success response records `succeeded`, post ID, optional canonical URL and content hash. The response is the evidence; no independent remote readback is performed.
- The same content hash skips another upload. Changed content reuses the saved post ID, so the official CLI sends an update. An update can overwrite edits made directly in KeyFlow; remote conflict detection is not implemented yet.
- A narrowly classified rejection before sending, such as no saved login, records `failed` and permits retry after repair.
- Timeout, malformed output, changed state, partial save or unexpected URL records `unknown`. Unresolved `pending`/`unknown` states block another write. A known partial-save ID is retained when provided by upstream.
- A leftover lock blocks writes. There is no automatic stale-lock removal. Check whether a process is still running and inspect the remote workspace before manually removing a lock.
- `status` only reports local bookkeeping. It does not confirm that a remote post still exists or is unchanged. The historical `liveVerified: false` output describes the original test coverage, not the user's acceptance decision. It is not a verification gate and does not prevent the KeyFlow command from running.

Unknown-outcome reconciliation and remote conflict checks remain stage 6 work. Do not reset unknown state or erase the journal to force another create. The adapter does not promise exactly-once delivery across machine failures, manual state changes or multiple project copies.

## Errors and upstream evidence

Child stdout/stderr, authentication details, server error bodies and hints are not forwarded into Postrail JSON/errors. Only expected, validated result fields are returned. Timeouts/output limits are bounded and ambiguous writes are not automatically retried. Cleanup errors tell the user to check the result; they do not claim that no upload occurred.

Additional codes include `KEYFLOW_ACCOUNT_REQUIRED`, `KEYFLOW_CONFIRM_REQUIRED`, `KEYFLOW_CHECK_FAILED`, `KEYFLOW_CONTRACT_MISMATCH`, `KEYFLOW_UNSUPPORTED_IMAGE_SYNTAX`, `KEYFLOW_UNSUPPORTED_TAG`, `KEYFLOW_UPLOAD_REJECTED`, `KEYFLOW_UNKNOWN_RESULT`, `KEYFLOW_STATE_FAILED`, `KEYFLOW_LOCKED`, `KEYFLOW_CLEANUP_FAILED`, `KEYFLOW_PROCESS_FAILED`, `KEYFLOW_INVALID_RESPONSE`, `KEYFLOW_LOGIN_FAILED`, `KEYFLOW_NOT_INSTALLED`, and `KEYFLOW_VERSION_MISMATCH`.

Primary evidence checked on 2026-11-10:

- [Official CLI repository](https://github.com/KeyFlow-me/keyflow-cli) and [platform CLI documentation](https://www.keyflow.me/tools/cli).
- [Exact published artifact](https://registry.npmjs.org/@keyflow-blog/cli/-/cli-2026.10.20.tgz); lockfile integrity: `sha512-qIyNk3NDeLf50EJGxJPRGYneon7pOIZzL0NfjGn4FJassCkzsv1CaNfrgNwh2DurjPHuWbOAt6Y6K1A36N1KAg==`.
- Installed `dist/index.js`, `commands/push.js`, `commands/login.js`, `post/resolve-post.js`, `post/upload-post.js`, and image collector/rewriter were inspected. Runtime source was tested instead of assuming the repository's newest README always matches a published version.
- The package metadata declares ISC, while its included LICENSE text says MIT. Both facts are recorded in [third-party notices](third-party-notices.md); Postrail preserves the distributed license text and does not relabel it.

The historical live acceptance above covered only the approved text draft and existing connection. Per the user's decision, do not initiate additional KeyFlow verification unless the user reopens that work. A returned management URL was observed to be stale; use the website's Manage → Library navigation if it opens as 404. Actual new uploads/publication still require authorization for their content and destination.
