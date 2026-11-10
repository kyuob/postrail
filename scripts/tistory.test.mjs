import assert from "node:assert/strict";
import { test } from "node:test";
import {
  mkdtempSync,
  writeFileSync,
  readFileSync,
  rmSync,
  mkdirSync,
  symlinkSync,
  readdirSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { loadArticle, loadConfig } from "../src/core.js";
import { tistoryTarget, TistoryClient } from "../src/tistory-client.js";
import {
  checkTistory,
  pushTistory,
  statusTistory,
  loginTistory,
  getTistory,
} from "../src/tistory.js";
import {
  editorConfig,
  verifyBlog,
  postFromConfig,
  attachment,
  renderTistory,
  canonicalHtml,
} from "../src/tistory-format.js";
import { journalPath, readJournal, saveJournal, locked } from "../src/tistory-storage.js";
import { manualChromeLogin } from "../src/manual-chrome-login.js";
import { EventEmitter } from "node:events";

test("manual Tistory login opens only the canonical manager and waits for user exit", async () => {
  const browser = new EventEmitter();
  let finished = false;
  const waiting = manualChromeLogin("/private/test-profile", {
    service: "tistory",
    destination: "https://test-blog.tistory.com/manage",
    platform: "darwin",
    spawnImpl: (_binary, args, options) => {
      assert.deepEqual(args, [
        "--user-data-dir=/private/test-profile",
        "--no-first-run",
        "--no-default-browser-check",
        "--restore-last-session",
        "https://test-blog.tistory.com/manage",
      ]);
      assert.equal(options.shell, false);
      assert.equal(options.stdio, "ignore");
      return browser;
    },
  }).then(() => {
    finished = true;
  });
  await Promise.resolve();
  assert.equal(finished, false);
  browser.emit("close", 0);
  await waiting;
  assert.equal(finished, true);
});
test("Tistory login forwards an explicit executable to its session", async () => {
  const chromePath = "/Users/test/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
  const blog = tistoryTarget("test-blog", "12345");
  await loginTistory(
    blog,
    async (_target, action, options) => {
      assert.deepEqual(options, { login: true, chromePath });
      return action({}, blog);
    },
    { chromePath },
  );
});
test("manual Tistory login rejects destination substitution and unsupported systems before spawn", async () => {
  const spawnImpl = () => {
    assert.fail("must not launch");
  };
  for (const destination of [
    "https://evil.test/manage",
    "https://test-blog.tistory.com/manage?token=SECRET",
    "https://test-blog.tistory.com.evil.test/manage",
  ]) {
    await assert.rejects(
      () =>
        manualChromeLogin("/profile", {
          service: "tistory",
          destination,
          platform: "darwin",
          spawnImpl,
        }),
      (e) => e.code === "TISTORY_REQUEST_INVALID" && !e.message.includes("SECRET"),
    );
  }
  await assert.rejects(
    () =>
      manualChromeLogin("/profile", {
        service: "tistory",
        destination: "https://test-blog.tistory.com/manage",
        platform: "linux",
        spawnImpl,
      }),
    (e) => e.code === "TISTORY_LOGIN_UNSUPPORTED",
  );
});

const target = tistoryTarget("test-blog", "12345");
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/a9sAAAAASUVORK5CYII=",
  "base64",
);
const upload = {
  url: "https://blog.kakaocdn.net/dna/aaa/bbb/img.png?credential=test&expires=123&signature=test",
  key: "aaa/bbb",
  filename: "img.png",
};
const cli = fileURLToPath(new URL("../dist/cli.js", import.meta.url));
const rejects = (fn, code) => assert.rejects(fn, (e) => e.code === code);
test("folded tag collisions fail check and push before authentication", async (t) => {
  const f = fixture(t, "public");
  writeFileSync(f.file, f.text.replace("[개발, CLI]", "[CLI, cli]"));
  assert.throws(() => checkTistory(f.article()), { code: "TISTORY_TAG_COLLISION" });
  await rejects(
    () => pushTistory(f.article(), target, f.dir, true, () => assert.fail("must not open session")),
    "TISTORY_TAG_COLLISION",
  );
  assert.equal(f.state().status, "not_submitted");
});
function fixture(t, visibility = "private", body = "한글 본문입니다.\n") {
  const dir = mkdtempSync(path.join(tmpdir(), "postrail-tistory-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, "article.md");
  const text = `---\nid: tistory-test\ntitle: 티스토리 검사\ntags: [개발, CLI]\nvisibility: ${visibility}\ntargets: [tistory]\n---\n${body}`;
  writeFileSync(file, text);
  writeFileSync(path.join(dir, "image.png"), png);
  const article = () =>
    loadArticle(file, loadConfig(path.join(dir, "postrail.json"), false), ["tistory"]);
  return { dir, file, text, article, state: () => statusTistory(article(), target, dir).state };
}
function config(entry) {
  return {
    blog: { domain: target.host, blogSettings: { blogId: target.blogId } },
    ...(entry ? { entry } : {}),
  };
}
function html(entry) {
  return `<html><script>window.Config = ${JSON.stringify(config(entry))};</script></html>`;
}
function server() {
  const state = { writes: [], reads: [], uploads: [], post: null };
  const client = {
    read: async (id) => {
      state.reads.push(id);
      return structuredClone(state.post);
    },
    upload: async (image, name) => {
      state.uploads.push({ name, data: Buffer.from(image.data) });
      return upload;
    },
    write: async (input, id) => {
      state.writes.push({ input: structuredClone(input), id });
      const entry = {
        id: id ?? "101",
        title: input.title,
        content: input.content,
        visibility: input.visibility,
        tags: input.tag,
        categoryId: input.category,
        slogan: input.slogan || "test-slug",
        uselessMarginForEntry: input.uselessMarginForEntry,
        cclCommercial: input.cclCommercial,
        cclDerive: input.cclDerive,
      };
      state.post = postFromConfig(config(entry), target, entry.id);
      return { postId: entry.id, url: `${target.origin}/${entry.id}` };
    },
  };
  return {
    client,
    state,
    session: async (t, action) => {
      assert.deepEqual(t, target);
      return action(client, target);
    },
  };
}
for (const visibility of ["private", "public"])
  test(`${visibility}: explicit create/readback, source preservation`, async (t) => {
    const f = fixture(t, visibility);
    const s = server();
    const result = await pushTistory(f.article(), target, f.dir, true, s.session);
    assert.equal(result.liveVerified, false);
    assert.equal(result.readbackVerified, true);
    assert.equal(s.state.writes[0].input.visibility, visibility === "private" ? 0 : 20);
    assert.equal(f.state().status, "succeeded");
    assert.equal(readFileSync(f.file, "utf8"), f.text);
    assert.equal((await getTistory(f.article(), target, f.dir, s.session)).matchesLastSaved, true);
  });
test("server ASCII tag casing is accepted while editor conflicts stay exact", async (t) => {
  const f = fixture(t);
  const s = server();
  const read = s.client.read;
  s.client.read = async (id) => {
    s.state.post.tags = s.state.post.tags.map((x) => x.toLowerCase());
    s.state.post.editor.tags = s.state.post.tags.join(",");
    return read(id);
  };
  await pushTistory(f.article(), target, f.dir, true, s.session);
  assert.equal((await getTistory(f.article(), target, f.dir, s.session)).matchesLastSaved, true);
  s.client.read = read;
  s.state.post.editor.tags = "개발,CLI";
  await rejects(
    () => pushTistory(f.article(), target, f.dir, true, s.session),
    "TISTORY_REMOTE_CONFLICT",
  );
});
for (const tags of [
  ["개발"],
  ["개발", "other"],
  ["개발", "cli", "cli"],
  ["開發", "cli"],
  ["개발", " cli"],
])
  test(`changed tag identity rejected: ${JSON.stringify(tags)}`, async (t) => {
    const f = fixture(t);
    const s = server();
    s.client.read = async () => ({ ...s.state.post, tags });
    await rejects(
      () => pushTistory(f.article(), target, f.dir, true, s.session),
      "TISTORY_READBACK_FAILED",
    );
  });
test("paragraphs and image captions keep visible spacing without leaking renderer rules", (t) => {
  const f = fixture(t, "private", "첫 문단.\n\n둘째 문단.\n\n![설명](image.png)\n\n- 하나\n- 둘\n");
  const a = f.article();
  const before = a.md.renderer.render(a.tokens, a.md.options, {});
  const output = renderTistory(a, new Map([["image.png", attachment(upload)]]));
  assert.equal((output.match(/style="margin: 0 0 1em !important;"/g) ?? []).length, 3);
  assert.match(output, /display: block; font-size: 0.875em/);
  assert.match(output, /<li>하나<\/li>/);
  assert.equal(a.md.renderer.render(a.tokens, a.md.options, {}), before);
});
test("older renderer journals update the same ID once, then skip", async (t) => {
  const f = fixture(t);
  const s = server();
  await pushTistory(f.article(), target, f.dir, true, s.session);
  const file = journalPath(f.dir, target, f.article().meta.id, false);
  const old = readJournal(file, target, f.article().meta.id);
  delete old.formatVersion;
  saveJournal(file, old);
  const result = await pushTistory(f.article(), target, f.dir, true, s.session);
  assert.equal(result.updated, true);
  assert.equal(result.postId, old.postId);
  assert.equal((await pushTistory(f.article(), target, f.dir, true, s.session)).skipped, true);
  assert.equal(s.state.writes.length, 2);
});
test("draft remains draft and is blocked before session, storage or upload", async (t) => {
  const f = fixture(t, "draft");
  assert.deepEqual(checkTistory(f.article()).blockers, ["TISTORY_DRAFT_UNSUPPORTED"]);
  await rejects(
    () =>
      pushTistory(f.article(), target, f.dir, true, () => {
        throw Error("MUST_NOT_OPEN");
      }),
    "TISTORY_DRAFT_UNSUPPORTED",
  );
  assert.equal(readdirSync(f.dir).includes(".postrail"), false);
});
test("confirmation, blog target and identity guards precede writes", async (t) => {
  const f = fixture(t);
  const denied = () => {
    throw Error("MUST_NOT_OPEN");
  };
  await rejects(
    () => pushTistory(f.article(), target, f.dir, false, denied),
    "TISTORY_CONFIRM_REQUIRED",
  );
  await rejects(
    () => pushTistory(f.article(), { ...target, origin: "https://evil.test" }, f.dir, true, denied),
    "TISTORY_BLOG_MISMATCH",
  );
  await rejects(
    () =>
      pushTistory(f.article(), target, f.dir, true, async (_t, action) =>
        action({}, { ...target, blogId: "999" }),
      ),
    "TISTORY_BLOG_MISMATCH",
  );
  assert.throws(() => tistoryTarget("https://test-blog.tistory.com", "12345"), {
    code: "TISTORY_BLOG_REQUIRED",
  });
  assert.throws(() => tistoryTarget("test-blog", "../id"), { code: "TISTORY_BLOG_ID_REQUIRED" });
});
test("unchanged source checks remote first; changed source updates exact saved ID", async (t) => {
  const f = fixture(t);
  const s = server();
  await pushTistory(f.article(), target, f.dir, true, s.session);
  assert.equal((await pushTistory(f.article(), target, f.dir, true, s.session)).skipped, true);
  writeFileSync(f.file, f.text + "수정\n");
  const result = await pushTistory(f.article(), target, f.dir, true, s.session);
  assert.equal(result.updated, true);
  assert.equal(s.state.writes.length, 2);
  assert.equal(s.state.writes[1].id, "101");
  assert.equal(s.state.writes[1].input.slogan, "test-slug");
  s.state.post.editor.title = "manual change";
  await rejects(
    () => pushTistory(f.article(), target, f.dir, true, s.session),
    "TISTORY_REMOTE_CONFLICT",
  );
  assert.equal(s.state.writes.length, 2);
});
test("lost write response leaves unknown and prevents any automatic recreation", async (t) => {
  const f = fixture(t);
  const s = server();
  s.client.write = async () => {
    throw Error("SERVER_SECRET");
  };
  await rejects(
    () => pushTistory(f.article(), target, f.dir, true, s.session),
    "TISTORY_UNKNOWN_RESULT",
  );
  assert.equal(f.state().status, "unknown");
  await rejects(
    () =>
      pushTistory(f.article(), target, f.dir, true, () => {
        throw Error("MUST_NOT_OPEN");
      }),
    "TISTORY_UNKNOWN_RESULT",
  );
});
for (const field of ["content", "visibility", "slogan"])
  test(`readback mismatch in ${field} retains ID, blocks retry`, async (t) => {
    const f = fixture(t);
    const s = server();
    await pushTistory(f.article(), target, f.dir, true, s.session);
    writeFileSync(f.file, f.text + "추가");
    const original = s.client.read;
    // First read is conflict preflight; the second is post-write verification.
    let reads = 0;
    s.client.read = async (id) => {
      const p = await original(id);
      if (++reads > 1) p[field] = field === "visibility" ? 20 : "changed";
      return p;
    };
    await rejects(
      () => pushTistory(f.article(), target, f.dir, true, s.session),
      "TISTORY_READBACK_FAILED",
    );
    assert.equal(f.state().status, "unknown");
    assert.equal(f.state().postId, "101");
  });
test("image references match attachments, deduplicate and preserve snapshot/source/code examples", async (t) => {
  const f = fixture(
    t,
    "private",
    "![이미지](image.png)\n\n![같은 그림][pic]\n\n[pic]: image.png\n\n```md\n![코드](image.png)\n```\n",
  );
  const s = server();
  const article = f.article();
  assert.equal(checkTistory(article).localImages, 1);
  writeFileSync(path.join(f.dir, "image.png"), "changed after read");
  await pushTistory(article, target, f.dir, true, s.session);
  assert.equal(s.state.uploads.length, 1);
  assert.deepEqual(s.state.uploads[0].data, png);
  const input = s.state.writes[0].input;
  assert.equal(input.attachments.length, 1);
  assert.match(input.attachments[0], /&amp;expires=/);
  assert.equal(input.content.split(input.attachments[0]).length - 1, 2);
  assert.match(input.content, /"originWidth":1,"originHeight":1/);
  assert.match(input.content, /!\[코드\]\(image.png\)/);
  assert.equal(readFileSync(f.file, "utf8"), f.text);
  assert.equal(
    article.md.renderer.render(article.tokens, article.md.options, {}).includes("[##_"),
    false,
  );
});
test("image failure blocks post write and persists unknown", async (t) => {
  const f = fixture(t, "private", "![a](image.png)");
  const s = server();
  s.client.upload = async () => ({ ...upload, url: "https://evil.test/image.png" });
  await rejects(
    () => pushTistory(f.article(), target, f.dir, true, s.session),
    "TISTORY_IMAGE_FAILED",
  );
  assert.equal(f.state().status, "unknown");
  assert.equal(s.state.writes.length, 0);
});
test("entity-encoded platform substitutions are rejected before upload or session", async (t) => {
  const f = fixture(t, "private", "&#91;##&#95;Image|kage@x/y?signature=z|CDM|1.3|{}&#95;##]");
  assert.throws(() => checkTistory(f.article()), { code: "TISTORY_MARKUP_UNSUPPORTED" });
  await rejects(
    () =>
      pushTistory(f.article(), target, f.dir, true, () => {
        throw Error("MUST_NOT_OPEN");
      }),
    "TISTORY_MARKUP_UNSUPPORTED",
  );
  assert.equal(readdirSync(f.dir).includes(".postrail"), false);
});
test("configuration parser handles literal braces, comments and single quotes without executing code", () => {
  const c = editorConfig(
    `<p>window.Config = {bad:true}</p><script>window.Config = { blog: {title:'brace }', /* { */ domain:'${target.host}', blogSettings:{blogId:'12345'}}, }; ignored();</script>`,
  );
  verifyBlog(c, target);
  assert.equal(c.blog.title, "brace }");
  for (const text of [
    "<script>window.Config = {blog: process.exit(1)};</script>",
    "<script>window.Config = {blog: (()=>{throw 1})()};</script>",
    "<script>window.Config = {};\nwindow.Config = {};</script>",
    "<p>window.Config = {};</p>",
  ])
    assert.throws(() => editorConfig(text), { code: "TISTORY_SCHEMA_UNSUPPORTED" });
});
test("current Config.post readback preserves raw fields and normalizes numeric options", () => {
  const entry = {
    id: "101",
    title: "test",
    content: "<p>body</p>",
    visibility: 0,
    category: "0",
    tags: ["tag"],
    slogan: "test",
    uselessMargin: "1",
    cclCommercial: "0",
    cclDerive: "0",
  };
  const c = { ...config(), post: entry };
  const post = postFromConfig(c, target, "101");
  assert.equal(post.category, 0);
  assert.equal(post.editor, entry);
  assert.deepEqual(post.editorOptions, {
    uselessMarginForEntry: 1,
    cclCommercial: 0,
    cclDerive: 0,
  });
  assert.throws(() => postFromConfig({ ...c, entry }, target, "101"), {
    code: "TISTORY_SCHEMA_UNSUPPORTED",
  });
  assert.throws(
    () => postFromConfig({ ...c, post: { ...entry, uselessMargin: "bad" } }, target, "101"),
    { code: "TISTORY_SCHEMA_UNSUPPORTED" },
  );
  assert.throws(() => postFromConfig({ ...c, post: { ...entry, category: null } }, target, "101"), {
    code: "TISTORY_SCHEMA_UNSUPPORTED",
  });
});
test("editor readback rejects wrong blog, missing/other IDs and protected posts", () => {
  assert.throws(
    () =>
      verifyBlog(
        { blog: { domain: "other.tistory.com", blogSettings: { blogId: "12345" } } },
        target,
      ),
    { code: "TISTORY_BLOG_MISMATCH" },
  );
  assert.throws(() => postFromConfig(config({ id: "999" }), target, "101"), {
    code: "TISTORY_SCHEMA_UNSUPPORTED",
  });
  assert.throws(
    () =>
      postFromConfig(
        config({ id: "101", title: "t", content: "c", visibility: 15 }),
        target,
        "101",
      ),
    { code: "TISTORY_SCHEMA_UNSUPPORTED" },
  );
});
test("canonical HTML accepts only documented cosmetic additions and retains meaningful changes", () => {
  const image = (dimensions) =>
    `<p>[##_Image|kage@dummy/image.png?test=1|CDM|1.3|${JSON.stringify(dimensions)}_##]</p>`;
  const dimensions = { originWidth: 96, originHeight: 96, style: "alignCenter" };
  assert.equal(
    canonicalHtml(image(dimensions)),
    canonicalHtml(image({ ...dimensions, originWidth: "96", originHeight: "96" })),
  );
  assert.notEqual(
    canonicalHtml(image(dimensions)),
    canonicalHtml(image({ ...dimensions, originWidth: "97" })),
  );
  assert.notEqual(
    canonicalHtml(image(dimensions)),
    canonicalHtml(image({ ...dimensions, style: "alignLeft" })),
  );
  assert.notEqual(
    canonicalHtml(image(dimensions)),
    canonicalHtml(image(dimensions).replace("dummy/image.png", "other/image.png")),
  );
  assert.equal(
    canonicalHtml("<h2>제목</h2><p>본문</p>"),
    canonicalHtml('<h2 id="tm-h-1">제목</h2><p data-ke-size="size16">본문</p>'),
  );
  assert.notEqual(
    canonicalHtml('<a href="https://a.test">a</a>'),
    canonicalHtml('<a href="https://b.test">a</a>'),
  );
  assert.notEqual(canonicalHtml("<p>본문</p>"), canonicalHtml("<p>다른 본문</p>"));
});
test("local journals reject symlinks/corruption and simultaneous writes", async (t) => {
  const f = fixture(t);
  mkdirSync(path.join(f.dir, ".postrail"), { mode: 0o755 });
  const file = journalPath(f.dir, target, "tistory-test", true);
  await locked(file, async () => {
    await rejects(() => locked(file, async () => {}), "TISTORY_LOCKED");
  });
  writeFileSync(file, "{}");
  assert.throws(() => readJournal(file, target, "tistory-test"), {
    code: "TISTORY_STORAGE_FAILED",
  });
  rmSync(file);
  symlinkSync(f.file, file);
  assert.throws(() => readJournal(file, target, "tistory-test"), {
    code: "TISTORY_STORAGE_FAILED",
  });
});
test("explicit login wrapper passes login mode and checks target", async () => {
  const result = await loginTistory(target, async (t, action, options) => {
    assert.deepEqual(t, target);
    assert.deepEqual(options, { login: true });
    return action({}, target);
  });
  assert.equal(result.blogId, "12345");
  await rejects(
    () => loginTistory(target, async (_t, action) => action({}, { ...target, blog: "other" })),
    "TISTORY_BLOG_MISMATCH",
  );
});
function transport(value, status = 200, raw = false) {
  const calls = [];
  let disposed = 0;
  const client = new TistoryClient(
    {
      fetch: async (url, options) => {
        calls.push({ url, options });
        return {
          status: () => status,
          body: async () => Buffer.from(raw ? value : JSON.stringify(value)),
          dispose: async () => {
            disposed++;
          },
        };
      },
    },
    target,
  );
  return { client, calls, disposed: () => disposed };
}
test("POST creates and PUT ID path updates, fixed destination with no redirects/retries", async () => {
  const f = transport({ entryUrl: `${target.origin}/101` });
  await f.client.write({ title: "a" });
  await f.client.write({ title: "a", id: "101" }, "101");
  assert.equal(f.calls[0].url, `${target.origin}/manage/post.json`);
  assert.equal(f.calls[0].options.method, "POST");
  assert.equal(f.calls[1].url, `${target.origin}/manage/post/101.json`);
  assert.equal(f.calls[1].options.method, "PUT");
  for (const c of f.calls) {
    assert.equal(c.options.maxRedirects, 0);
    assert.equal(c.options.maxRetries, 0);
    assert.equal(c.options.headers.Origin, target.origin);
  }
  assert.equal(f.disposed(), 2);
});
test("ID readback and identity use authenticated editor HTML, never assumed GET JSON route", async () => {
  const entry = {
    id: "101",
    title: "t",
    content: "<p>c</p>",
    visibility: 0,
    categoryId: 0,
    slogan: "t",
    tags: [],
  };
  const f = transport(html(entry), 200, true);
  await f.client.identity();
  assert.equal((await f.client.read("101")).title, "t");
  assert.equal(f.calls[1].url, `${target.origin}/manage/newpost/101`);
});
for (const [value, status, raw, code] of [
  ["SECRET", 302, true, "TISTORY_LOGIN_REQUIRED"],
  ["SECRET", 403, true, "TISTORY_LOGIN_REQUIRED"],
  ["SECRET", 500, true, "TISTORY_HTTP_FAILED"],
  ["<html>login</html>", 200, true, "TISTORY_RESPONSE_INVALID"],
  [{ entryUrl: "https://evil.test/101" }, 200, false, "TISTORY_RESPONSE_INVALID"],
  [{ entryUrl: `${target.origin}/auth/login` }, 200, false, "TISTORY_RESPONSE_INVALID"],
])
  test(`transport failure ${status} ${code} is sanitized and never retried`, async () => {
    const f = transport(value, status, raw);
    await assert.rejects(
      () => f.client.write({}),
      (e) => e.code === code && !e.message.includes("SECRET"),
    );
    assert.equal(f.calls.length, 1);
    assert.equal(f.disposed(), 1);
  });
test("multipart uploads use validated bytes, reject foreign references", async () => {
  const f = transport(upload);
  await f.client.upload({ mime: "image/png", data: png }, "image.png");
  assert.equal(f.calls[0].url, `${target.origin}/manage/post/attach.json`);
  assert.deepEqual(f.calls[0].options.multipart.file.buffer, png);
  for (const invalid of [
    { ...upload, key: "../bad" },
    { ...upload, url: upload.url.replace("blog.kakaocdn.net", "evil.test") },
    { ...upload, filename: "other.png" },
  ])
    assert.throws(() => attachment(invalid), { code: "TISTORY_IMAGE_FAILED" });
});
test("built CLI check/status/early guards are offline and leave home empty", (t) => {
  const f = fixture(t, "draft");
  const home = path.join(f.dir, "home");
  mkdirSync(home);
  const guard = path.join(f.dir, "guard.cjs");
  writeFileSync(
    guard,
    `const deny=()=>{throw Error('NETWORK_FORBIDDEN')};global.fetch=deny;for(const n of ['http','https']){const m=require('node:'+n);m.request=deny;m.get=deny;}require('node:net').Socket.prototype.connect=deny;`,
  );
  for (const [args, code] of [
    [["check", f.file], null],
    [["status", f.file, "--blog", target.blog, "--blog-id", target.blogId], null],
    [
      ["push", "/missing.md", "--blog", target.blog, "--blog-id", target.blogId],
      "TISTORY_CONFIRM_REQUIRED",
    ],
    [["push", f.file, "--confirm"], "TISTORY_BLOG_REQUIRED"],
    [
      ["push", f.file, "--blog", target.blog, "--blog-id", target.blogId, "--confirm"],
      "TISTORY_DRAFT_UNSUPPORTED",
    ],
    [["check", f.file, "--cookie", "SECRET"], "INVALID_ARGUMENT"],
  ]) {
    const r = spawnSync(process.execPath, ["--require", guard, cli, "tistory", ...args, "--json"], {
      cwd: f.dir,
      env: { ...process.env, HOME: home },
      encoding: "utf8",
      timeout: 10000,
    });
    assert.ifError(r.error);
    assert.doesNotMatch(r.stdout + r.stderr, /NETWORK_FORBIDDEN|SECRET/);
    const value = JSON.parse(r.stdout);
    assert.equal(value.ok, code === null, r.stdout);
    if (code) assert.equal(value.error.code, code);
  }
  assert.deepEqual(readdirSync(home), []);
  const r = spawnSync(process.execPath, ["--require", guard, cli, "plan", f.file, "--json"], {
    cwd: f.dir,
    env: { ...process.env, HOME: home },
    encoding: "utf8",
    timeout: 10000,
  });
  assert.deepEqual(JSON.parse(r.stdout).targets[0].blockers, [
    "DESTINATIONS_REQUIRED",
    "CONFIRM_REQUIRED",
    "TISTORY_DRAFT_UNSUPPORTED",
  ]);
});
