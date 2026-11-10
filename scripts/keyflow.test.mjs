import assert from "node:assert/strict";
import { test } from "node:test";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  readdirSync,
  rmSync,
  existsSync,
  symlinkSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";
import { loadArticle, loadConfig } from "../src/core.js";
import {
  KEYFLOW_VERSION,
  runOfficial,
  withPreparedArticle,
  checkKeyflow,
  pushKeyflow,
  statusKeyflow,
  loginKeyflow,
} from "../src/keyflow.js";

const require = createRequire(import.meta.url);
const entry = require.resolve("@keyflow-blog/cli");
const cli = fileURLToPath(new URL("../dist/cli.js", import.meta.url));
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/a9sAAAAASUVORK5CYII=",
  "base64",
);
function fixture(t, visibility = "draft") {
  const dir = mkdtempSync(path.join(tmpdir(), "postrail-keyflow-test-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const home = path.join(dir, "home");
  mkdirSync(path.join(home, ".keyflow"), { recursive: true });
  // A dry-run must not even try to load this deliberately invalid auth store.
  writeFileSync(path.join(home, ".keyflow", "config.json"), "invalid auth store");
  const guard = path.join(dir, "offline.cjs");
  writeFileSync(
    guard,
    `const deny=()=>{throw new Error('NETWORK_FORBIDDEN')}; globalThis.fetch=deny;
for(const n of ['http','https']){let m=require('node:'+n);m.request=deny;m.get=deny;}
require('node:net').Socket.prototype.connect=deny;`,
  );
  const env = {
    PATH: process.env.PATH,
    HOME: home,
    USERPROFILE: home,
    SystemRoot: process.env.SystemRoot,
    NO_COLOR: "1",
  };
  const run = (program, args) => {
    const result = spawnSync(process.execPath, ["--require", guard, program, ...args], {
      cwd: dir,
      env,
      encoding: "utf8",
      timeout: 10_000,
      maxBuffer: 1024 * 1024,
    });
    assert.ifError(result.error);
    assert.doesNotMatch(result.stdout + result.stderr, /NETWORK_FORBIDDEN/);
    return result;
  };
  const official = (args) => run(entry, args);
  const write = (name, content) => writeFileSync(path.join(dir, name), content);
  const source = `---\nid: same-article\ntitle: 한글과 '인용'\ntags: [개발, CLI]\nvisibility: ${visibility}\n---\n본문은 바꾸지 않습니다.\n`;
  write("source.md", source);
  const article = () =>
    loadArticle(path.join(dir, "source.md"), loadConfig(path.join(dir, "postrail.json")), [
      "keyflow",
    ]);
  const stateFile = () =>
    path.join(
      dir,
      ".postrail",
      "keyflow",
      readdirSync(path.join(dir, ".postrail", "keyflow"))[0],
      "state.json",
    );
  const simulated = (actual = {}) => {
    const calls = [];
    const runner = (args) => {
      calls.push(args);
      if (args.includes("--dry-run")) return official(args);
      const content = readFileSync(args[1], "utf8");
      const meta = parse(/^---\n([\s\S]*?)\n---\n/.exec(content)[1]);
      const value = {
        ok: true,
        postId: meta.keyflow?.id ?? "post-123",
        url: "https://www.keyflow.me/post/post-123",
        updated: !!meta.keyflow?.id,
        status: meta.publish ? "published" : "draft",
        visibility: meta.visibility,
        ...actual,
      };
      return { status: 0, stdout: JSON.stringify(value), stderr: "secret-child-output" };
    };
    return { runner, calls };
  };
  return { dir, write, article, source, official, stateFile, simulated, run };
}
const code = (fn, expected) => assert.throws(fn, (error) => error.code === expected);

test("published official CLI version and help match the pinned contract", (t) => {
  const f = fixture(t);
  const info = JSON.parse(readFileSync(path.resolve(path.dirname(entry), "../package.json")));
  assert.equal(info.version, KEYFLOW_VERSION);
  const result = f.official(["push", "--help"]);
  assert.equal(result.status, 0);
  for (const flag of ["--dry-run", "--json", "--account"]) assert(result.stdout.includes(flag));
  assert.equal(typeof runOfficial, "function");
});

for (const [input, status, visibility] of [
  ["draft", "draft", "private"],
  ["private", "published", "private"],
  ["public", "published", "public"],
]) {
  test(`real official dry-run maps ${input} to ${status}/${visibility} without auth or network`, (t) => {
    const f = fixture(t, input);
    const result = checkKeyflow(f.article(), f.official);
    assert.equal(result.status, status);
    assert.equal(result.visibility, visibility);
    assert.equal(result.offline, true);
    assert.equal(result.liveVerified, false);
    assert.equal(readFileSync(path.join(f.dir, "source.md"), "utf8"), f.source);
    assert(!existsSync(path.join(f.dir, ".postrail")));
  });
}

test("prepared copy snapshots validated inline images and cleans itself after use", (t) => {
  const f = fixture(t);
  f.write("한글 image.png", png);
  f.write("source.md", f.source + "\n![그림](한글%20image.png)\n");
  let temporary;
  withPreparedArticle(f.article(), "known-id", (file) => {
    temporary = file;
    const text = readFileSync(file, "utf8");
    assert.match(text, /id: known-id/);
    assert.match(text, /!\[그림\]\(image-0.png\)/);
    assert.deepEqual(readFileSync(path.join(path.dirname(file), "image-0.png")), png);
  });
  assert(!existsSync(temporary));
  assert.equal(checkKeyflow(f.article(), f.official).images, 1);
  assert.match(readFileSync(path.join(f.dir, "source.md"), "utf8"), /한글%20image.png/);
});

for (const [name, body] of [
  ["local reference", "![x][ref]\n\n[ref]: pixel.png"],
  ["mixed reference and inline", "![x](pixel.png)\n\n![y][ref]\n\n[ref]: pixel.png"],
  ["escaped false positive", "\\![x](pixel.png)"],
])
  test(`parser differences block ${name} before invoking official CLI`, (t) => {
    const f = fixture(t);
    f.write("pixel.png", png);
    f.write("source.md", f.source + body);
    code(
      () =>
        checkKeyflow(f.article(), () => {
          assert.fail("must not spawn");
        }),
      "KEYFLOW_UNSUPPORTED_IMAGE_SYNTAX",
    );
  });

test("leading hashtag normalization is explicit instead of silent", (t) => {
  const f = fixture(t);
  f.write("source.md", f.source.replace("[개발, CLI]", "['#개발']"));
  code(() => checkKeyflow(f.article()), "KEYFLOW_UNSUPPORTED_TAG");
});

test("confirmation and explicit account are required before any writes or subprocess", (t) => {
  const f = fixture(t);
  const runner = () => assert.fail("must not spawn");
  code(() => pushKeyflow(f.article(), "author", f.dir, false, runner), "KEYFLOW_CONFIRM_REQUIRED");
  code(() => pushKeyflow(f.article(), undefined, f.dir, true, runner), "KEYFLOW_ACCOUNT_REQUIRED");
  code(
    () => pushKeyflow(f.article(), "../unsafe", f.dir, true, runner),
    "KEYFLOW_ACCOUNT_REQUIRED",
  );
  assert(!existsSync(path.join(f.dir, ".postrail")));
});

test("successful simulated create records identity, preserves source, skips unchanged and updates same ID", (t) => {
  const f = fixture(t);
  const { runner, calls } = f.simulated();
  const created = pushKeyflow(f.article(), "author", f.dir, true, runner);
  assert.equal(created.postId, "post-123");
  assert.equal(created.updated, false);
  assert.equal(created.liveVerified, false);
  assert.equal(calls[1][2], "--account");
  assert.equal(calls[1][3], "author");
  assert(!existsSync(calls[1][1]));
  assert.equal(readFileSync(path.join(f.dir, "source.md"), "utf8"), f.source);
  assert.equal(statusKeyflow(f.article(), "author", f.dir).state.status, "succeeded");
  assert.equal(pushKeyflow(f.article(), "author", f.dir, true, runner).skipped, true);
  assert.equal(calls.length, 2);
  f.write("source.md", f.source + "\n추가 본문");
  assert.equal(pushKeyflow(f.article(), "author", f.dir, true, runner).updated, true);
  assert.equal(calls.length, 4);
  assert.equal(statusKeyflow(f.article(), "another-author", f.dir).state.status, "not_submitted");
});

for (const failure of [
  {
    status: 1,
    stdout: JSON.stringify({ ok: false, error: { code: "push-failed", message: "secret-token" } }),
  },
  { status: 0, stdout: "secret-token invalid JSON" },
  {
    status: null,
    error: Object.assign(new Error("secret-token"), { code: "ETIMEDOUT" }),
    stdout: "",
  },
  {
    status: 0,
    stdout: JSON.stringify({
      ok: true,
      postId: "post-123",
      updated: false,
      status: "published",
      visibility: "public",
    }),
  },
])
  test(`uncertain result is persisted and blocks retry (${failure.status}/${failure.error?.code ?? failure.stdout.slice(0, 16)})`, (t) => {
    const f = fixture(t);
    let writes = 0;
    const runner = (args) => {
      if (args.includes("--dry-run")) return f.official(args);
      writes++;
      return failure;
    };
    assert.throws(
      () => pushKeyflow(f.article(), "author", f.dir, true, runner),
      (error) => {
        assert.doesNotMatch(error.message, /secret-token/);
        return true;
      },
    );
    assert.equal(statusKeyflow(f.article(), "author", f.dir).state.status, "unknown");
    code(() => pushKeyflow(f.article(), "author", f.dir, true, runner), "KEYFLOW_UNKNOWN_RESULT");
    assert.equal(writes, 1);
  });

test("known pre-send authentication rejection is retryable and hides child messages", (t) => {
  const f = fixture(t);
  const runner = (args) =>
    args.includes("--dry-run")
      ? f.official(args)
      : {
          status: 1,
          stdout: JSON.stringify({
            ok: false,
            error: { code: "not-logged-in", message: "secret-token" },
          }),
        };
  code(() => pushKeyflow(f.article(), "author", f.dir, true, runner), "KEYFLOW_UPLOAD_REJECTED");
  assert.equal(statusKeyflow(f.article(), "author", f.dir).state.status, "failed");
  assert.equal(
    pushKeyflow(f.article(), "author", f.dir, true, f.simulated().runner).postId,
    "post-123",
  );
});

test("unexpected URLs remain unknown", (t) => {
  const f = fixture(t);
  code(
    () =>
      pushKeyflow(
        f.article(),
        "author",
        f.dir,
        true,
        f.simulated({ url: "https://evil.example/?token=secret" }).runner,
      ),
    "KEYFLOW_INVALID_RESPONSE",
  );
  assert.equal(statusKeyflow(f.article(), "author", f.dir).state.status, "unknown");
});

test("an update that returns a different post ID is not accepted as success", (t) => {
  const f = fixture(t);
  pushKeyflow(f.article(), "author", f.dir, true, f.simulated().runner);
  f.write("source.md", f.source + "\n수정 내용");
  code(
    () =>
      pushKeyflow(
        f.article(),
        "author",
        f.dir,
        true,
        f.simulated({ postId: "different-post" }).runner,
      ),
    "KEYFLOW_CONTRACT_MISMATCH",
  );
  const state = statusKeyflow(f.article(), "author", f.dir).state;
  assert.equal(state.status, "unknown");
  assert.equal(state.postId, "post-123");
});

test("interrupted pending journal blocks another submission even without a lock", (t) => {
  const f = fixture(t);
  pushKeyflow(f.article(), "author", f.dir, true, f.simulated().runner);
  const file = f.stateFile();
  const state = JSON.parse(readFileSync(file));
  writeFileSync(file, JSON.stringify({ ...state, status: "pending" }));
  code(
    () => pushKeyflow(f.article(), "author", f.dir, true, () => assert.fail("must not spawn")),
    "KEYFLOW_UNKNOWN_RESULT",
  );
});

test("postSaved errors retain ID but never become success", (t) => {
  const f = fixture(t);
  const runner = (args) =>
    args.includes("--dry-run")
      ? f.official(args)
      : {
          status: 1,
          stdout: JSON.stringify({
            ok: false,
            postSaved: true,
            postId: "saved-456",
            error: { code: "not-logged-in" },
          }),
        };
  code(() => pushKeyflow(f.article(), "author", f.dir, true, runner), "KEYFLOW_UNKNOWN_RESULT");
  assert.equal(statusKeyflow(f.article(), "author", f.dir).state.postId, "saved-456");
});

test("failed offline contract check does not mark upload pending or call live child", (t) => {
  const f = fixture(t);
  code(
    () =>
      pushKeyflow(f.article(), "author", f.dir, true, () => ({
        status: 0,
        stdout: JSON.stringify({
          ok: true,
          dryRun: true,
          status: "published",
          visibility: "public",
          images: { total: 0, uploaded: 0 },
        }),
      })),
    "KEYFLOW_CONTRACT_MISMATCH",
  );
  assert.equal(statusKeyflow(f.article(), "author", f.dir).state.status, "not_submitted");
});

test("symlink state directories cannot redirect journal writes", (t) => {
  const f = fixture(t);
  const outside = path.join(f.dir, "outside");
  mkdirSync(outside);
  symlinkSync(outside, path.join(f.dir, ".postrail"));
  code(
    () => pushKeyflow(f.article(), "author", f.dir, true, f.simulated().runner),
    "KEYFLOW_STATE_FAILED",
  );
  assert.deepEqual(readdirSync(outside), []);
});

test("corrupt state and stale lock stop instead of recreating a remote post", (t) => {
  const f = fixture(t);
  pushKeyflow(f.article(), "author", f.dir, true, f.simulated().runner);
  const file = f.stateFile();
  writeFileSync(file + ".lock", "");
  code(
    () => pushKeyflow(f.article(), "author", f.dir, true, () => assert.fail()),
    "KEYFLOW_LOCKED",
  );
  rmSync(file + ".lock");
  writeFileSync(file, "{ invalid");
  code(
    () => pushKeyflow(f.article(), "author", f.dir, true, () => assert.fail()),
    "KEYFLOW_STATE_FAILED",
  );
});

test("cleanup failure after a saved post never claims that nothing was uploaded", (t) => {
  const f = fixture(t);
  const simulation = f.simulated();
  const runner = (args) => {
    const result = simulation.runner(args);
    if (!args.includes("--dry-run")) {
      const lock = f.stateFile() + ".lock";
      rmSync(lock);
      mkdirSync(lock); // Trigger a real unlink failure after successful persistence.
    }
    return result;
  };
  assert.throws(
    () => pushKeyflow(f.article(), "author", f.dir, true, runner),
    (error) => {
      assert.equal(error.code, "KEYFLOW_CLEANUP_FAILED");
      assert.match(error.message, /Check local and remote/);
      assert.doesNotMatch(error.message, /[Nn]o content was uploaded/);
      return true;
    },
  );
  assert.equal(statusKeyflow(f.article(), "author", f.dir).state.status, "succeeded");
});

test("login delegates only explicit account and has no fake success on cancellation", () => {
  assert.equal(
    loginKeyflow("author", (args, options) => {
      assert.deepEqual(args, ["login", "--account", "author"]);
      assert.equal(options.interactive, true);
      return { status: 0 };
    }).ok,
    true,
  );
  code(
    () => loginKeyflow("author", () => ({ status: null, signal: "SIGTERM" })),
    "KEYFLOW_LOGIN_FAILED",
  );
});

test("built CLI official dry-run and status work in isolated HOME", (t) => {
  const f = fixture(t);
  for (const args of [
    ["keyflow", "check", "source.md"],
    ["keyflow", "status", "source.md", "--account", "author"],
  ]) {
    const result = f.run(cli, [...args, "--json"]);
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.equal(JSON.parse(result.stdout).ok, true);
  }
  assert(!existsSync(path.join(f.dir, ".postrail")));
});

for (const args of [
  ["keyflow"],
  ["keyflow", "push", "source.md"],
  ["keyflow", "login", "--account", "author", "--json"],
  ["keyflow", "check", "source.md", "--confirm"],
  ["keyflow", "push", "source.md", "--account", "author"],
]) {
  test(`built CLI refuses unsafe/incomplete arguments: ${args.join(" ")}`, (t) => {
    const f = fixture(t);
    const result = f.run(cli, args.includes("--json") ? args : [...args, "--json"]);
    assert.equal(result.status, 1);
    assert.equal(JSON.parse(result.stdout).ok, false);
    assert(!existsSync(path.join(f.dir, ".postrail")));
  });
}
