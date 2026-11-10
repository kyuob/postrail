import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync, symlinkSync, copyFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { loadArticle, loadConfig, preview } from "../src/core.js";
import { parseArguments } from '../src/arguments.js';
import { ERROR_CODES, EXIT_CODES, isPublishErrorCode } from '../src/error-codes.js';
import { printPublish } from '../src/publish-output.js';

test('shared arguments preserve strict boundaries and exact caller error messages', () => {
  const spec = { allowed: ['--json', '--account'], optionError: 'bad option', argumentError: 'bad path' };
  assert.deepEqual(parseArguments(['--account', 'tester', 'article.md', '--json'], spec), { file: 'article.md', options: { '--account': 'tester', '--json': true } });
  for (const args of [['--json', '--json'], ['--unknown'], ['--account=tester'], ['--']]) assert.throws(() => parseArguments(args, spec), { code: 'INVALID_ARGUMENT', message: 'bad option' });
  for (const args of [['--account'], ['--account', '--json'], ['--account', '']]) assert.throws(() => parseArguments(args, spec), { code: 'INVALID_ARGUMENT', message: 'Option requires a value.' });
  assert.throws(() => parseArguments(['a.md', 'b.md'], spec), { message: 'bad path' });
  assert.throws(() => parseArguments(['a.md'], { ...spec, positional: false }), { message: 'bad path' });
});

test('error contract rejects forged adapter codes and has stable exit statuses', () => {
  assert.deepEqual(EXIT_CODES, { success: 0, error: 1 });
  assert(isPublishErrorCode('TISTORY_UNKNOWN_RESULT'));
  assert(isPublishErrorCode('BLOGGER_RECOVERY_STALE'));
  for (const code of ['VELOG_SECRET_CONTENT', '__proto__', 'INVALID_ARGUMENT', undefined]) assert.equal(isPublishErrorCode(code), false);
  const all = Object.values(ERROR_CODES).flat();
  assert.equal(new Set(all).size, all.length);
});

test('publish text retains unresolved-write guidance and saved IDs', t => {
  const lines = [];
  t.mock.method(console, 'log', line => lines.push(line));
  printPublish({ offline: false, results: [{ platform: 'velog', status: 'failed', postId: 'saved-id', error: { code: 'VELOG_UNKNOWN_RESULT' }, localStatus: 'unknown', nextAction: 'inspect_remote' }] });
  assert.deepEqual(lines, ['  velog: failed (saved-id) — VELOG_UNKNOWN_RESULT; local state: unknown; inspect the saved remote result; do not resend an unresolved write']);
});

const cli = fileURLToPath(new URL("../dist/cli.js", import.meta.url));
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/a9sAAAAASUVORK5CYII=", "base64");
const header = "---\nid: first-post\ntitle: 한글 첫 글\ntags: [개발, CLI]\n---\n";
function fixture(t) {
  const dir = mkdtempSync(path.join(tmpdir(), "postrail-test-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  mkdirSync(path.join(dir, "home"));
  const guard = path.join(dir, "offline.cjs");
  writeFileSync(guard, `const denied=()=>{throw new Error('NETWORK_FORBIDDEN')};
globalThis.fetch=denied;
for(const name of ['http','https']){const m=require('node:'+name);m.request=denied;m.get=denied;}
const net=require('node:net');net.connect=denied;net.createConnection=denied;net.Socket.prototype.connect=denied;
`);
  const write = (name, content) => writeFileSync(path.join(dir, name), content);
  const run = (...args) => {
    const result = spawnSync(process.execPath, ["--require", guard, cli, ...args], {
      cwd: dir, encoding: "utf8", timeout: 10_000,
      env: { ...process.env, HOME: path.join(dir, "home"), USERPROFILE: path.join(dir, "home") },
    });
    assert.ifError(result.error);
    assert.doesNotMatch(result.stdout + result.stderr, /NETWORK_FORBIDDEN/);
    return result;
  };
  const json = (...args) => {
    const result = run(...args, "--json");
    assert.equal(result.stderr, "");
    const data = JSON.parse(result.stdout);
    assert.equal(result.status, data.ok ? 0 : 1, result.stdout);
    return data;
  };
  write("article.md", header + "본문입니다.\n");
  return { dir, write, run, json };
}

test("init creates usable config and never replaces existing content", t => {
  const { dir, json } = fixture(t);
  assert.equal(json("init").ok, true);
  const before = readFileSync(path.join(dir, "postrail.json"));
  assert.equal(json("init").error.code, "FILE_EXISTS");
  assert.deepEqual(readFileSync(path.join(dir, "postrail.json")), before);
  assert.equal(json("validate", "article.md").article.visibility, "draft");
});

test("config symlink is not overwritten by init", t => {
  const { dir, json, write } = fixture(t);
  write("keep.txt", "unchanged");
  symlinkSync(path.join(dir, "keep.txt"), path.join(dir, "postrail.json"));
  assert.equal(json("init").error.code, "FILE_EXISTS");
  assert.equal(readFileSync(path.join(dir, "keep.txt"), "utf8"), "unchanged");
});

test("configuration precedence and target override remain offline", t => {
  const { write, json } = fixture(t);
  write("custom.json", JSON.stringify({ version: 1, targets: ["keyflow"], visibility: "private" }));
  const data = json("plan", "article.md", "--config", "custom.json");
  assert.deepEqual(data.article.targets, ["keyflow"]);
  assert.equal(data.article.visibility, "private");
  write("article.md", header.replace("tags:", "targets: [tistory]\nvisibility: public\ntags:") + "본문");
  const override = json("plan", "article.md", "--config", "custom.json", "--to", "velog,keyflow");
  assert.deepEqual(override.article.targets, ["velog", "keyflow"]);
  assert.equal(override.article.visibility, "public");
  assert.equal(override.offline, true);
  assert.equal(override.ready, false);
  assert(override.targets.every(p => !p.canPublish));
  assert.equal(override.targets.find(p => p.platform === "velog").status, "experimental");
  assert.equal(override.targets.find(p => p.platform === "keyflow").status, "implemented");
  assert.deepEqual(override.targets.find(p => p.platform === "keyflow").blockers, ["DESTINATIONS_REQUIRED", "CONFIRM_REQUIRED"]);
});

test("absent config uses defaults but explicit missing config fails", t => {
  const { json } = fixture(t);
  assert.deepEqual(json("validate", "article.md").article.targets, ["velog", "tistory", "keyflow", "blogger"]);
  assert.equal(json("validate", "article.md", "--config", "missing.json").error.code, "INVALID_CONFIG");
});

test("broken default config symlink fails instead of silently using defaults", t => {
  const { dir, json } = fixture(t);
  symlinkSync(path.join(dir, "missing.json"), path.join(dir, "postrail.json"));
  assert.equal(json("validate", "article.md").error.code, "INVALID_CONFIG");
});

test("Blogger is accepted in metadata, --to and new config while its adapter stays blocked", t => {
  const { dir, write, json } = fixture(t);
  assert.equal(json("init").ok, true);
  assert.deepEqual(JSON.parse(readFileSync(path.join(dir, "postrail.json"))).targets, ["velog", "tistory", "keyflow", "blogger"]);
  write("article.md", header.replace("tags:", "targets: [blogger]\ntags:") + "구글 블로거로 보낼 원고");
  assert.deepEqual(json("validate", "article.md").article.targets, ["blogger"]);
  const plan = json("plan", "article.md", "--to", "velog,tistory,keyflow,blogger");
  assert.equal(plan.ready, false);
  assert.deepEqual(plan.targets.find(p => p.platform === "blogger"), {
    platform: "blogger", visibility: "draft", status: "experimental", canPublish: false, blockers: ["DESTINATIONS_REQUIRED", "CONFIRM_REQUIRED"],
  });
  assert.deepEqual(json("plan", "article.md").article.targets, ["blogger"]);
});

test("existing explicit three-platform config is preserved after Blogger is added", t => {
  const { write, json } = fixture(t);
  write("postrail.json", JSON.stringify({ version: 1, targets: ["velog", "tistory", "keyflow"], visibility: "draft" }));
  assert.deepEqual(json("plan", "article.md").article.targets, ["velog", "tistory", "keyflow"]);
  assert.equal(json("plan", "article.md", "--to", "google-blogger").error.code, "INVALID_ARGUMENT");
});

for (const [name, content] of [
  ["invalid JSON", "{"], ["non-object", "[]"], ["wrong version", '{"version":2}'],
  ["unknown field", '{"version":1,"targets":["velog"],"visibility":"draft","token":"do-not-echo"}'],
  ["invalid target", '{"version":1,"targets":["unknown"],"visibility":"draft"}'],
]) test(`config rejects ${name} without echoing input`, t => {
  const { write, json } = fixture(t);
  write("postrail.json", content);
  const data = json("validate", "article.md");
  assert.equal(data.error.code, "INVALID_CONFIG");
  assert.doesNotMatch(JSON.stringify(data), /do-not-echo/);
});

for (const [name, content, code = "INVALID_METADATA"] of [
  ["missing frontmatter", "# Plain text"],
  ["missing id", "---\ntitle: Hi\n---\nbody"],
  ["duplicate keys", header.replace("title:", "title: Other\ntitle:") + "body"],
  ["bad YAML", "---\nid: [\n---\nbody"],
  ["custom tag", "---\nid: !!js/function bad\ntitle: Hi\n---\nbody"],
  ["alias", "---\nid: &id first\ntitle: *id\n---\nbody"],
  ["non-object", "---\n- a\n---\nbody"],
  ["invalid id", header.replace("first-post", "../post") + "body"],
  ["empty title", header.replace("한글 첫 글", "''") + "body"],
  ["wrong tags type", header.replace("[개발, CLI]", "tag") + "body"],
  ["null tags", header.replace("[개발, CLI]", "null") + "body"],
  ["null visibility", header.replace("tags:", "visibility: null\ntags:") + "body"],
  ["duplicate tags", header.replace("[개발, CLI]", "[a, a]") + "body"],
  ["unknown field", header.replace("tags:", "secret: do-not-echo\ntags:") + "body"],
  ["invalid visibility", header.replace("tags:", "visibility: hidden\ntags:") + "body"],
  ["invalid targets", header.replace("tags:", "targets: []\ntags:") + "body"],
  ["empty body", header, "INVALID_ARTICLE"],
]) test(`article rejects ${name}`, t => {
  const { write, json } = fixture(t);
  write("article.md", content);
  const data = json("validate", "article.md");
  assert.equal(data.error.code, code);
  assert.doesNotMatch(JSON.stringify(data), /do-not-echo/);
});

test("UTF-8, article size and regular-file limits fail predictably", t => {
  const { dir, write, json } = fixture(t);
  write("article.md", Buffer.from([255, 254]));
  assert.equal(json("validate", "article.md").error.code, "INVALID_ARTICLE");
  write("article.md", "a".repeat(2 * 1024 * 1024 + 1));
  assert.equal(json("validate", "article.md").error.code, "READ_FAILED");
  assert.equal(json("validate", dir).error.code, "READ_FAILED");
  assert.equal(json("validate", "missing.md").error.code, "READ_FAILED");
});

test("BOM/CRLF, Korean content and stable identity survive file moves", t => {
  const { dir, write, json } = fixture(t);
  write("article.md", "\ufeff" + (header + "한국어 내용\n").replace(/\n/g, "\r\n"));
  copyFileSync(path.join(dir, "article.md"), path.join(dir, "moved.md"));
  const first = json("validate", "article.md").article;
  assert.equal(first.title, "한글 첫 글");
  assert.equal(first.contentHash, json("validate", "moved.md").article.contentHash);
  write("moved.md", header + "변경된 본문");
  assert.notEqual(first.contentHash, json("validate", "moved.md").article.contentHash);
});

test("preview renders code, tables, links and embedded reference images offline", t => {
  const { write, json } = fixture(t);
  write("pixel.png", png);
  write("article.md", header + '# 소제목\n\n```js\nconst title = "한글";\n```\n\n| 이름 | 값 |\n| --- | --- |\n| 테스트 | 1 |\n\n[문서](https://example.com/)\n\n![그림][local]\n\n[local]: pixel.png\n');
  const data = json("preview", "article.md");
  assert.match(data.html, /<table>/);
  assert.match(data.html, /<code class="language-js">/);
  assert.match(data.html, /href="https:\/\/example.com\/"/);
  assert.match(data.html, /src="data:image\/png;base64,/);
  assert.match(data.html, /alt="그림"/);
  assert.equal(data.article.images.length, 1);
});

test("preview omits remote images without fetching and escapes hostile HTML/title", t => {
  const { write, json } = fixture(t);
  write("article.md", header.replace("한글 첫 글", "'</title><script>alert(1)</script>'") + '\n<script>alert(1)</script>\n\n<img src=x onerror=alert(1)>\n\n![외부](https://127.0.0.1:9/tracker.png)\n\n[bad](javascript:alert(1))\n\n[file](file:///etc/passwd)\n');
  const data = json("preview", "article.md");
  assert.doesNotMatch(data.html, /<script>|<img src=x|href="(?:javascript|file):|src="https?:/);
  assert.match(data.html, /&lt;script&gt;/);
  assert.match(data.html, /default-src 'none'/);
  assert.match(data.html, /external image omitted/);
  assert.deepEqual(data.article.warnings, ["REMOTE_IMAGES_NOT_FETCHED"]);
});

for (const [name, reference] of [
  ["missing image", "missing.png"], ["parent traversal", "../outside.png"],
  ["absolute path", "/etc/passwd"], ["encoded traversal", "%2E%2E/outside.png"],
  ["SVG", "unsafe.svg"], ["bad signature", "fake.png"],
]) test(`image validation rejects ${name}`, t => {
  const { write, json } = fixture(t);
  write("article.md", header + `![image](${reference})`);
  write("unsafe.svg", '<svg onload="alert(1)"/>');
  write("fake.png", "not a PNG");
  assert.equal(json("validate", "article.md").error.code, "INVALID_IMAGE");
});

test("image validation follows symlinks and rejects targets outside article directory", t => {
  const { dir, write, json } = fixture(t);
  mkdirSync(path.join(dir, "nested"));
  write("pixel.png", png);
  symlinkSync(path.join(dir, "pixel.png"), path.join(dir, "nested", "linked.png"));
  write("nested/article.md", header + "![image](linked.png)");
  assert.equal(json("validate", "nested/article.md").error.code, "INVALID_IMAGE");
});

test("image changes affect content hash and percent-encoded spaces work", t => {
  const { write, json } = fixture(t);
  write("한글 image.png", png);
  write("article.md", header + "![image](한글%20image.png)");
  const before = json("validate", "article.md").article.contentHash;
  write("한글 image.png", Buffer.concat([png, Buffer.from([0])]));
  assert.notEqual(before, json("validate", "article.md").article.contentHash);
});

test("rendering one parsed article twice preserves tokens and embedded images", t => {
  const { dir, write } = fixture(t);
  write("pixel.png", png);
  write("article.md", header + "![**한글 그림**](pixel.png)");
  const article = loadArticle(path.join(dir, "article.md"), loadConfig(path.join(dir, "postrail.json")));
  const tokens = JSON.stringify(article.tokens);
  const first = preview(article);
  assert.match(first, /src="data:image\/png;base64,/);
  assert.equal(preview(article), first);
  assert.equal(JSON.stringify(article.tokens), tokens);
});

test("preview output refuses existing files and never replaces source", t => {
  const { dir, write, json, run } = fixture(t);
  const source = readFileSync(path.join(dir, "article.md"));
  assert.equal(json("preview", "article.md", "--output", "article.md").error.code, "FILE_EXISTS");
  assert.deepEqual(readFileSync(path.join(dir, "article.md")), source);
  assert.equal(json("preview", "article.md", "--output", "preview.html").ok, true);
  assert.match(readFileSync(path.join(dir, "preview.html"), "utf8"), /^<!doctype html>/);
  assert.equal(json("preview", "article.md", "--output", "preview.html").error.code, "FILE_EXISTS");
  assert.equal(json("preview", "article.md", "--output", "missing/preview.html").error.code, "WRITE_FAILED");
  write("existing.html", "keep");
  symlinkSync(path.join(dir, "existing.html"), path.join(dir, "linked.html"));
  assert.equal(json("preview", "article.md", "--output", "linked.html").error.code, "FILE_EXISTS");
  assert.equal(readFileSync(path.join(dir, "existing.html"), "utf8"), "keep");
  assert.match(run("preview", "article.md").stdout, /^<!doctype html>/);
});

test("validation and plan have no filesystem write effects", t => {
  const { dir, json } = fixture(t);
  const before = readdirSync(dir);
  assert.equal(json("validate", "article.md").ok, true);
  assert.equal(json("plan", "article.md").ok, true);
  assert.deepEqual(readdirSync(dir), before);
  assert.deepEqual(readdirSync(path.join(dir, "home")), []);
});

for (const args of [
  ["validate"], ["validate", "article.md", "extra.md"], ["init", "extra"],
  ["plan", "article.md", "--to"], ["plan", "article.md", "--to", "unknown"],
  ["plan", "article.md", "--to", "velog,velog"], ["preview", "article.md", "--output"],
  ["validate", "article.md", "--output", "out"], ["validate", "article.md", "--unknown"],
  ["validate", "article.md", "--config", "--json"], ["publish", "article.md"],
]) test(`strict argument errors: ${args.join(" ")}`, t => {
  const { run } = fixture(t);
  const result = run(...args, ...(args.includes("--json") ? [] : ["--json"]));
  assert.equal(result.status, 1);
  assert.equal(result.stderr, "");
  assert.equal(JSON.parse(result.stdout).ok, false);
});
