# Fable 5.2 publication acceptance

2026-11-10: the user-approved article is publicly available in Korean on [Tistory](https://ekyu.tistory.com/128) and [Velog](https://velog.io/@kyu_ios_dev/claude-fable52-launch-ko-20261110-130ea80e), and in English on [Blogger](https://kyuob.blogspot.com/2026/11/claude-fable-52-is-here-more-capable.html). Each publication retains its existing saved ID through corrections.

The source article and its existing KeyFlow draft were preserved. All16 numbered sections and10 original images remain. The English version preserves the full source and adds English explanatory captions for six Korean-text figures. Exactly two additional clickable recommendations use the user's existing **02-sena** and **03-alliance** landscape marketing banners. The first links to the Toonbook library; the second to the Battle Partner introduction. The surrounding copy is localized. The original marketing files were not edited.

Two integration corrections were needed:

- Velog and Tistory reuse existing tags with canonical ASCII casing. Intended-versus-readback verification now accepts only ASCII case equivalence, rejecting changed identities, whitespace, duplicates and folded collisions. Stored remote fingerprints and conflict checks remain exact. The first uncertain journals were preserved, then reconciled under locks after owned same-ID reads, body checks and original-image byte comparisons; no posts were recreated.
- Tistory's paragraph-spacing stylesheet uses `!important` to zero paragraph margins. Generated HTML now explicitly spaces paragraphs and distinguishes image captions while preserving editor options. A renderer version updates older journaled posts once using the existing ID, after checking remote conflicts. The editor's Markdown mode is not used: Tistory and Blogger receive generated HTML; Velog receives Markdown.

Direct external promotional images worked in standalone HTTP checks but failed in Tistory's image proxy. Tistory and Velog now use registered platform uploads. Blogger reuses byte-verified public Velog CDN images, consistent with its lack of local image upload support.

Evidence:167 scoped publishing regressions passed; an independent source review found no blocker in the tag/formatting changes. Structural checks preserve16 sections, original source/translation and12 images per article. Authenticated final readbacks confirm public status and exact saved fingerprints. Native Chrome screenshots and six actual image clicks verified both banners on all three sites and Tistory paragraph spacing. Mobile rendering was not tested. Private operational receipts remain in ignored local storage. No repository push or package release was performed.
