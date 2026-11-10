import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtempSync, writeFileSync, readFileSync, rmSync, symlinkSync } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { inspectImages, IMAGE_LIMIT, TOTAL_IMAGE_LIMIT } from "../src/images.js";
import { loadArticle } from "../src/core.js";

const config = { targets: ["velog"], visibility: "draft" };
const signatures = {
  png: Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  jpg: Buffer.from([255, 216, 255]),
  gif: Buffer.from("GIF89a"),
  webp: Buffer.from("RIFFxxxxWEBP"),
};
function fixture(t) {
  const dir = mkdtempSync(path.join(tmpdir(), "postrail-images-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, "article.md");
  return {
    dir,
    file,
    article(body) {
      writeFileSync(file, `---\nid: budget\ntitle: Image budget\n---\n${body}`);
    },
    image(name, bytes = 64) {
      const data = Buffer.alloc(bytes);
      signatures[path.extname(name).slice(1)].copy(data);
      writeFileSync(path.join(dir, name), data);
      return data;
    },
  };
}
test("inventory preserves PNG/JPEG/GIF/WebP originals and source aliases; never fetches remote images", (t) => {
  const f = fixture(t);
  const originals = Object.keys(signatures).map((ext) => [ext, f.image(`a.${ext}`)]);
  f.article(
    "![x](a.png) ![x](a.png) ![alias](./a.png)\n![ref][g]\n\n[g]: a.gif\n\n![j](a.jpg) ![w](a.webp) ![remote](https://invalid.example/a.png)",
  );
  const report = inspectImages(f.file, config);
  assert.equal(report.ok, true);
  assert.equal(report.totalBytes, 5 * 64);
  assert.equal(report.uniqueFiles, 4);
  assert.equal(report.uniqueFileBytes, 4 * 64);
  assert.equal(report.images[0].occurrences, 2);
  assert.equal(report.images.at(-1).kind, "remote");
  for (const [ext, data] of originals)
    assert.deepEqual(readFileSync(path.join(f.dir, `a.${ext}`)), data);
});
test("file and total boundaries match publishing limits, while oversize reports remain available", (t) => {
  const f = fixture(t);
  f.image("a.png", IMAGE_LIMIT);
  f.article("![a](a.png)");
  assert.equal(inspectImages(f.file, config).ok, true);
  assert.doesNotThrow(() => loadArticle(f.file, config));
  f.image("a.png", IMAGE_LIMIT + 1);
  let report = inspectImages(f.file, config);
  assert.equal(report.ok, false);
  assert.equal(report.images[0].excessBytes, 1);
  assert.throws(() => loadArticle(f.file, config));
  f.image("a.png", IMAGE_LIMIT);
  for (const name of ["b.png", "c.png", "d.png"]) f.image(name, IMAGE_LIMIT);
  f.article(["a", "b", "c", "d"].map((n) => `![x](${n}.png)`).join("\n"));
  assert.equal(inspectImages(f.file, config).totalBytes, TOTAL_IMAGE_LIMIT);
  assert.equal(inspectImages(f.file, config).ok, true);
  f.image("e.png", 12);
  f.article(["a", "b", "c", "d", "e"].map((n) => `![x](${n}.png)`).join("\n"));
  report = inspectImages(f.file, config);
  assert.equal(report.excessBytes, 12);
  assert.equal(report.ok, false);
  assert.throws(() => loadArticle(f.file, config));
});
test("inventory rejects invalid paths, non-files, signatures and escaped symlinks", (t) => {
  const f = fixture(t);
  f.image("a.png");
  for (const source of ["../outside.png", "missing.png", ".", "a.png%3Fquery", "%xx"]) {
    f.article(`![x](${source})`);
    assert.throws(() => inspectImages(f.file, config), { code: "INVALID_IMAGE" });
  }
  writeFileSync(path.join(f.dir, "bad.png"), "not a png");
  f.article("![x](bad.png)");
  assert.throws(() => inspectImages(f.file, config), { code: "INVALID_IMAGE" });
  if (process.platform !== "win32") {
    symlinkSync(process.execPath, path.join(f.dir, "escape.png"));
    f.article("![x](escape.png)");
    assert.throws(() => inspectImages(f.file, config), { code: "INVALID_IMAGE" });
  }
});
test("built CLI reports oversize JSON and exits 1, normal inventory exits 0", (t) => {
  const f = fixture(t);
  f.image("a.png", IMAGE_LIMIT + 1);
  f.article("![x](a.png)");
  const cli = fileURLToPath(new URL("../dist/cli.js", import.meta.url));
  let result = spawnSync(process.execPath, [cli, "images", f.file, "--json"], {
    cwd: f.dir,
    encoding: "utf8",
  });
  assert.equal(result.status, 1);
  assert.equal(JSON.parse(result.stdout).images[0].excessBytes, 1);
  f.image("a.png");
  result = spawnSync(process.execPath, [cli, "images", f.file], { cwd: f.dir, encoding: "utf8" });
  assert.equal(result.status, 0);
  assert.match(result.stdout, /Local total: 64\/20971520 bytes/);
});
