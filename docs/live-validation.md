# KeyFlow private-draft live acceptance

Date: 2026-11-10 (Asia/Seoul). Tested against the pinned official CLI 2026.10.20 and the existing signed-in KeyFlow service.

The human explicitly approved creating **one private draft from examples/article.md and updating that same post**. The official CLI reported one saved active account, which was selected explicitly. No new authentication flow was needed. No other article was changed, and no public publication or deletion was performed.

## Results

| Check | Result and evidence |
|---|---|
| Official offline preflight | Passed; reported draft/private before sending |
| Create | Actual upstream response confirmed draft/private, new post ID, updated=false |
| Repeat unchanged content | Postrail returned skipped=true and the same ID without another upload |
| Update | A working copy added `Postrail 비공개 초안 수정 검증 완료.`; actual response confirmed the same ID, draft/private, updated=true |
| Original preservation | Tracked example checksum remained unchanged; working copy was exactly the original plus the marker |
| Local journal | succeeded; post ID matched both responses and content hash matched the final parsed working copy |
| Remote UI | Native Chrome showed the sample in Library as Draft / 임시 저장; its Analytics link matched the response ID, and its Preview showed the exact update marker |
| Independent review | A second read-only reviewer rechecked hashes, journal, script logic and proof consistency. The reviewer did not independently re-observe the browser |

Private IDs, account metadata, source copies and proof remain under ignored `.postrail/`; they are not published in this report. `scripts/verify-keyflow-live.mjs` checks local evidence consistency, including the journal and recorded UI observations. It does **not** independently contact the service or verify a browser session.

## Limits and observed upstream issue

- The approved sample was text-only. Live image uploads, published/private posts, public publication, fresh interactive login, remote conflict resolution and failure reconciliation were not exercised.
- An unauthenticated HTML request returned HTTP 200 without the source heading or update marker. This is a limited HTML non-disclosure observation, **not** a comprehensive access-control audit.
- The API returned a generic `/en/manage/workspace/posts` URL that opened as 404. The site's own Manage navigation led to Library; the test row's Preview was used for readback. A returned URL is not proof of a working post-specific link. The adapter currently preserves the upstream URL rather than guessing a new per-post URL.
- Existing published posts and unrelated drafts were not edited. The test draft is retained for the human to inspect.

## Running a future manual acceptance test

This is separate from automated CI. Obtain fresh approval for the exact sample and selected account, then run:

```sh
bun run build
node scripts/keyflow-live.mjs --account ACCOUNT --confirm-private-sample
```

The script refuses to run again if a previous evidence file exists. It does not clear unknown state, remove old test data, or create another post automatically. After a completed create/update, an authorized operator must actually inspect the remote draft, correlate its ID and observe the marker before recording `remoteReadback` assertions and changing proof status to `verified`. Keep those observations private and distinguish recorded UI evidence from an automated remote check.

```sh
node scripts/verify-keyflow-live.mjs
```

The script and proof contain no credential values. Do not paste official CLI authentication stores into logs or commit `.postrail/`.
