# Security policy

## Scope and supported versions

Postrail is pre-release software. There is no published stable version or supported historical release line yet. Security fixes target the current main branch. Public publishing, credential handling and platform changes can have consequences beyond a local command; test only with your own authorized accounts and fake content.

## Reporting

Do not post working credentials, exploit details involving another user, private article contents or session material in public issues.

Use GitHub's private reporting option on this repository's [security advisories page](https://github.com/kyuob/postrail/security/advisories) **if “Report a vulnerability” is available**. This document does not claim that private reporting has been enabled. If it is unavailable, open a minimal public issue requesting a private contact method, without sensitive details or an exploit payload. Maintainers must establish a private route before collecting those details. No response-time or bounty commitment is offered.

Include the affected commit/version, OS/runtime, impacted component, a minimal fake-data reproducer, expected boundary and observed impact. Remove tokens, cookies, OAuth client contents, magic-link codes, signed image URLs, personal blog IDs and full environment/log dumps. Source code may help identify the issue; never include another user's data as proof.

GitHub explains the opt-in behavior in its [private vulnerability reporting documentation](https://docs.github.com/en/code-security/security-advisories/working-with-repository-security-advisories/configuring-private-vulnerability-reporting-for-a-repository).

## Storage and boundaries

- Velog/Tistory use only Postrail's dedicated Chrome profiles. Postrail does not extract ordinary Chrome cookies or unlock the user's Keychain.
- Blogger uses user-approved Desktop OAuth and an exact user/blog binding. Its tokens are stored in POSIX-private local JSON, not claimed to be encrypted by an OS Keychain. Windows OAuth storage is unsupported pending ACL validation.
- Project `.postrail/` journals preserve remote IDs, content hashes and uncertain outcomes. They are local state, not public support attachments. Do not delete them just to retry a write.
- Destinations files contain nonsecret account/blog identifiers only. Do not put any credentials in them. Accounts, private drafts, tokens and browser sessions must not be committed.
- Offline preview disables raw HTML execution and remote image loading. User-clicked ordinary links are still links. A successful dry run does not prove authentication or remote permission.
- Confirmation, exact identities, per-platform journals and locks reduce duplicate/incorrect writes; they are not an exactly-once guarantee.

Do not disable verification/CAPTCHA, add stealth settings, broaden allowed hosts or retry unknown writes to work around a security check. Dependencies and internal platform interfaces can change; the [support matrix](docs/support.md) records the verified scope.
