import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, lstatSync, realpathSync, renameSync, unlinkSync, rmSync, openSync, closeSync, fsyncSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { stringify } from "yaml";
import { collectLocalImages } from "@keyflow-blog/cli/dist/images/collect-local-images.js";
import { fail, readBounded } from "./core.js";

export const KEYFLOW_VERSION = "2026.10.20";
const require = createRequire(import.meta.url);
const hash = value => createHash("sha256").update(value).digest("hex");
const validId = value => typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9._-]{0,199}$/.test(value);
export function accountName(value) {
  if (typeof value !== "string" || !/^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$/.test(value)) fail("KEYFLOW_ACCOUNT_REQUIRED", "Pass --account with an explicit saved KeyFlow account name (1–64 letters, digits, dots, underscores or hyphens).");
  return value;
}
function officialEntry() {
  try {
    const entry = require.resolve("@keyflow-blog/cli");
    const info = JSON.parse(readFileSync(path.resolve(path.dirname(entry), "../package.json"), "utf8"));
    if (info.version !== KEYFLOW_VERSION) fail("KEYFLOW_VERSION_MISMATCH", "The installed KeyFlow CLI does not match the tested version.");
    return entry;
  } catch (error) {
    if (error.code === "KEYFLOW_VERSION_MISMATCH") throw error;
    fail("KEYFLOW_NOT_INSTALLED", "Install Postrail's locked dependencies before using KeyFlow.");
  }
}

// argv is always an array. Never interpolate an article into a shell command.
export function runOfficial(args, { interactive = false } = {}) {
  const env = { ...process.env, NO_COLOR: "1" };
  // Keep credentials in the official CLI's own storage/environment, never argv.
  delete env.NODE_OPTIONS;
  delete env.NODE_PATH;
  return spawnSync(process.execPath, [officialEntry(), ...args], {
    encoding: "utf8", env, shell: false, timeout: interactive ? 300_000 : 120_000,
    maxBuffer: 1024 * 1024, stdio: interactive ? "inherit" : "pipe", windowsHide: !interactive,
  });
}
function parseResult(result) {
  if (result.error || result.signal) fail("KEYFLOW_PROCESS_FAILED", "KeyFlow did not return a complete result. Check local status before trying again.");
  try {
    const value = JSON.parse(result.stdout);
    if (!value || typeof value !== "object" || Array.isArray(value) || typeof value.ok !== "boolean") throw new Error();
    return value;
  } catch { fail("KEYFLOW_INVALID_RESPONSE", "KeyFlow returned an unrecognized result. Child output was withheld."); }
}
function mode(article) {
  return { status: article.meta.visibility === "draft" ? "draft" : "published", visibility: article.meta.visibility === "public" ? "public" : "private" };
}
function safeUrl(value) {
  if (value === undefined) return undefined;
  try {
    const url = new URL(value);
    if (url.origin === "https://www.keyflow.me" && !url.username && !url.password && !url.search && !url.hash) return url.href;
  } catch { /* Do not echo arbitrary upstream URLs. */ }
  fail("KEYFLOW_INVALID_RESPONSE", "KeyFlow returned an unexpected post URL.");
}

export function withPreparedArticle(article, postId, action) {
  if (article.meta.tags.some(tag => tag.startsWith("#"))) fail("KEYFLOW_UNSUPPORTED_TAG", "KeyFlow removes leading # from tags. Use tags without a leading # before uploading.");
  const refs = collectLocalImages(article.body);
  const counts = new Map();
  const expected = new Map();
  function visit(tokens) {
    for (const token of tokens) {
      if (token.type === "image") {
        const src = token.attrGet("src");
        if (article.images.get(src)?.kind === "local") expected.set(src, (expected.get(src) ?? 0) + 1);
      }
      if (token.children) visit(token.children);
    }
  }
  visit(article.tokens);
  for (const ref of refs) {
    const src = article.md.normalizeLink(ref.raw);
    counts.set(src, (counts.get(src) ?? 0) + 1);
  }
  if (counts.size !== expected.size || [...expected].some(([src, count]) => counts.get(src) !== count)) {
    fail("KEYFLOW_UNSUPPORTED_IMAGE_SYNTAX", "KeyFlow and Postrail interpret these images differently. Use simple inline local image syntax; reference images are not supported by this adapter yet.");
  }
  const directory = mkdtempSync(path.join(tmpdir(), "postrail-keyflow-"));
  try {
    const assetNames = new Map();
    for (const [src, image] of article.images) {
      if (image.kind !== "local") continue;
      const extension = { "image/png": "png", "image/jpeg": "jpg", "image/gif": "gif", "image/webp": "webp" }[image.mime];
      const name = `image-${assetNames.size}.${extension}`;
      assetNames.set(src, name);
      writeFileSync(path.join(directory, name), image.data, { mode: 0o600, flag: "wx" });
    }
    let body = article.body;
    for (const ref of [...refs].sort((a, b) => b.start - a.start)) {
      const name = assetNames.get(article.md.normalizeLink(ref.raw));
      if (!name) fail("KEYFLOW_UNSUPPORTED_IMAGE_SYNTAX", "A local image was not validated by Postrail.");
      body = body.slice(0, ref.start) + name + body.slice(ref.end);
    }
    const desired = mode(article);
    const metadata = { title: article.meta.title, tags: article.meta.tags, publish: desired.status === "published", visibility: desired.visibility, ...(postId ? { keyflow: { id: postId } } : {}) };
    const file = path.join(directory, "article.md");
    writeFileSync(file, `---\n${stringify(metadata)}---\n${body}`, { mode: 0o600, flag: "wx" });
    return action(file, desired, assetNames.size);
  } finally {
    try { rmSync(directory, { recursive: true, force: true }); }
    catch { fail("KEYFLOW_CLEANUP_FAILED", "Temporary working files could not be removed. Check local and remote upload results before retrying."); }
  }
}

function checked(file, desired, imageCount, runner) {
  const result = runner(["push", file, "--dry-run", "--json"]);
  const data = parseResult(result);
  if (result.status !== 0 || !data.ok) fail("KEYFLOW_CHECK_FAILED", "KeyFlow's offline checks rejected the converted article. No upload was attempted.");
  if (data.dryRun !== true || data.status !== desired.status || data.visibility !== desired.visibility || data.images?.total !== imageCount || data.images.uploaded !== 0) fail("KEYFLOW_CONTRACT_MISMATCH", "KeyFlow's offline result does not match the intended article state.");
  return { status: desired.status, visibility: desired.visibility, images: imageCount };
}
export function checkKeyflow(article, runner = runOfficial) {
  return withPreparedArticle(article, undefined, (file, desired, count) => ({ ok: true, command: "keyflow check", offline: true, cliVersion: KEYFLOW_VERSION, liveVerified: false, ...checked(file, desired, count, runner) }));
}
export function loginKeyflow(account, runner = runOfficial) {
  accountName(account);
  const result = runner(["login", "--account", account], { interactive: true });
  if (result.error || result.signal || result.status !== 0) fail("KEYFLOW_LOGIN_FAILED", "KeyFlow login did not complete. No credential values were collected by Postrail.");
  return { ok: true, command: "keyflow login", account, liveVerified: false };
}

function privateDirectory(parent, name) {
  const directory = path.join(parent, name);
  try { mkdirSync(directory, { mode: 0o700 }); }
  catch (error) { if (error.code !== "EEXIST") fail("KEYFLOW_STATE_FAILED", "Cannot create the local KeyFlow state directory."); }
  const stat = lstatSync(directory);
  if (!stat.isDirectory() || stat.isSymbolicLink()) fail("KEYFLOW_STATE_FAILED", "KeyFlow state paths must be real directories, not symlinks.");
  return directory;
}
function stateLocation(cwd, id, account, create) {
  const names = [".postrail", "keyflow", hash(JSON.stringify([id, account]))];
  let directory = realpathSync(cwd);
  for (const name of names) {
    if (create) directory = privateDirectory(directory, name);
    else {
      directory = path.join(directory, name);
      try { const stat = lstatSync(directory); if (!stat.isDirectory() || stat.isSymbolicLink()) fail("KEYFLOW_STATE_FAILED", "Invalid state directory."); }
      catch (error) { if (error.code === "ENOENT") return undefined; throw error; }
    }
  }
  return path.join(directory, "state.json");
}
function readState(file, id, account) {
  if (!file) return undefined;
  try {
    const stat = lstatSync(file);
    if (!stat.isFile() || stat.isSymbolicLink()) fail("KEYFLOW_STATE_FAILED", "State must be a regular file.");
  } catch (error) { if (error.code === "ENOENT") return undefined; throw error; }
  let state;
  try { state = JSON.parse(readBounded(file, 64 * 1024, "KEYFLOW_STATE_FAILED").toString()); }
  catch { fail("KEYFLOW_STATE_FAILED", "Local KeyFlow state is unreadable; do not delete it before checking the remote result."); }
  if (!state || state.version !== 1 || state.articleId !== id || state.account !== account || !["pending", "succeeded", "failed", "unknown"].includes(state.status) || (state.postId !== undefined && !validId(state.postId)) || (state.status === "succeeded" && !validId(state.postId))) fail("KEYFLOW_STATE_FAILED", "Local KeyFlow state is invalid.");
  if (state.url !== undefined) safeUrl(state.url);
  return state;
}
function saveState(file, state) {
  const temporary = `${file}.${randomUUID()}.tmp`;
  let fd;
  try {
    fd = openSync(temporary, "wx", 0o600);
    writeFileSync(fd, JSON.stringify(state, null, 2) + "\n");
    fsyncSync(fd);
    closeSync(fd); fd = undefined;
    renameSync(temporary, file);
  } catch { fail("KEYFLOW_STATE_FAILED", "Could not persist the upload result. Stop and check the remote result before retrying."); }
  finally {
    if (fd !== undefined) closeSync(fd);
    try { unlinkSync(temporary); } catch { /* Already renamed or never created. */ }
  }
}
export function statusKeyflow(article, account, cwd) {
  accountName(account);
  const state = readState(stateLocation(cwd, article.meta.id, account, false), article.meta.id, account);
  return { ok: true, command: "keyflow status", account, articleId: article.meta.id, offline: true, liveVerified: false,
    state: state ? { status: state.status, postId: state.postId, url: state.url, contentHash: state.contentHash } : { status: "not_submitted" } };
}

export function pushKeyflow(article, account, cwd, confirmed, runner = runOfficial) {
  accountName(account);
  if (!confirmed) fail("KEYFLOW_CONFIRM_REQUIRED", "Uploading sends this article and its images to KeyFlow. Add --confirm after reviewing the article, account and visibility.");
  const file = stateLocation(cwd, article.meta.id, account, true);
  const lock = `${file}.lock`;
  let lockFd;
  try { lockFd = openSync(lock, "wx", 0o600); }
  catch { fail("KEYFLOW_LOCKED", "Another operation or a previous interrupted upload holds the lock. Inspect the local and remote results before removing it."); }
  try {
    const old = readState(file, article.meta.id, account);
    if (old && ["pending", "unknown"].includes(old.status)) fail("KEYFLOW_UNKNOWN_RESULT", "The previous upload is unresolved. Check KeyFlow before retrying; automatic re-upload is blocked.");
    if (old?.status === "succeeded" && old.contentHash === article.contentHash) return { ok: true, command: "keyflow push", account, skipped: true, postId: old.postId, url: old.url, liveVerified: false };
    return withPreparedArticle(article, old?.postId, (prepared, desired, imageCount) => {
      checked(prepared, desired, imageCount, runner);
      const state = { version: 1, articleId: article.meta.id, account, contentHash: article.contentHash, status: "pending", postId: old?.postId, url: old?.url };
      // Persist uncertainty BEFORE a child process may send a write.
      saveState(file, state);
      let result, data;
      try { result = runner(["push", prepared, "--account", account, "--json"]); data = parseResult(result); }
      catch (error) { saveState(file, { ...state, status: "unknown" }); throw error; }
      if (result.status !== 0 || !data.ok) {
        const rejectedBeforeSend = !data.postSaved && ["not-logged-in", "account-selection-failed", "invalid-server", "check-failed", "file-not-found", "empty-content"].includes(data.error?.code);
        saveState(file, { ...state, status: rejectedBeforeSend ? "failed" : "unknown", ...(validId(data.postId) ? { postId: data.postId } : {}) });
        fail(rejectedBeforeSend ? "KEYFLOW_UPLOAD_REJECTED" : "KEYFLOW_UNKNOWN_RESULT", rejectedBeforeSend ? "KeyFlow rejected the request before uploading. Check the saved account and run the offline check." : "KeyFlow did not confirm the complete result. Check the remote workspace; automatic re-upload is blocked.");
      }
      let url;
      try {
        if (data.dryRun || !validId(data.postId) || data.status !== desired.status || data.visibility !== desired.visibility || data.updated !== Boolean(old?.postId) || (old?.postId && data.postId !== old.postId)) fail("KEYFLOW_CONTRACT_MISMATCH", "KeyFlow did not confirm the expected saved post and state.");
        url = safeUrl(data.url);
      } catch (error) { saveState(file, { ...state, status: "unknown" }); throw error; }
      saveState(file, { ...state, status: "succeeded", postId: data.postId, url });
      return { ok: true, command: "keyflow push", account, postId: data.postId, url, updated: data.updated, status: desired.status, visibility: desired.visibility, liveVerified: false };
    });
  } finally {
    try { closeSync(lockFd); unlinkSync(lock); }
    catch { fail("KEYFLOW_CLEANUP_FAILED", "The operation lock could not be removed. Check local and remote upload results before retrying."); }
  }
}
