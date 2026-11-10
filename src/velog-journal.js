import { mkdirSync, lstatSync, realpathSync, openSync, writeFileSync, closeSync, fsyncSync, renameSync, unlinkSync } from "node:fs";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { fail, readBounded } from "./core.js";

export const digest = value => createHash("sha256").update(typeof value === "string" || Buffer.isBuffer(value) ? value : JSON.stringify(value)).digest("hex");
function syncDirectory(directory) {
  if (process.platform === "win32") return;
  const fd = openSync(directory, "r");
  try { fsyncSync(fd); } finally { closeSync(fd); }
}
export function privateDirectory(parent, name, ownerOnly = true) {
  const directory = path.join(parent, name);
  try { mkdirSync(directory, { mode: 0o700 }); syncDirectory(parent); }
  catch (error) { if (error.code !== "EEXIST") fail("VELOG_STORAGE_FAILED", "Cannot create the Postrail storage directory."); }
  const stat = lstatSync(directory);
  if (stat.isSymbolicLink() || !stat.isDirectory()) fail("VELOG_STORAGE_FAILED", "Postrail storage must use real directories, not symlinks.");
  if (ownerOnly && process.platform !== "win32" && (stat.mode & 0o077)) fail("VELOG_STORAGE_PERMISSIONS", "Postrail storage must be accessible only by its owner (mode 0700).");
  return directory;
}
export function journalPath(cwd, account, id, create) {
  let directory = realpathSync(cwd);
  for (const name of [".postrail", "velog", digest([account, id])]) {
    if (create) directory = privateDirectory(directory, name, name !== ".postrail");
    else {
      directory = path.join(directory, name);
      try { const stat = lstatSync(directory); if (stat.isSymbolicLink() || !stat.isDirectory()) fail("VELOG_STORAGE_FAILED", "Invalid local journal directory."); }
      catch (error) { if (error.code === "ENOENT") return undefined; throw error; }
    }
  }
  return path.join(directory, "state.json");
}
export function readJournal(file, account, articleId) {
  if (!file) return undefined;
  try { const stat = lstatSync(file); if (!stat.isFile() || stat.isSymbolicLink()) fail("VELOG_STORAGE_FAILED", "The local journal must be a regular file."); }
  catch (error) { if (error.code === "ENOENT") return undefined; throw error; }
  let value;
  try { value = JSON.parse(readBounded(file, 64 * 1024, "VELOG_STORAGE_FAILED").toString("utf8")); }
  catch { fail("VELOG_STORAGE_FAILED", "The local journal is unreadable. Inspect the remote result before changing it."); }
  if (!value || value.version !== 1 || value.account !== account || value.articleId !== articleId || !["pending", "succeeded", "unknown"].includes(value.status)
    || typeof value.ownerId !== "string" || !value.ownerId || typeof value.contentHash !== "string" || !/^[a-f0-9]{64}$/.test(value.contentHash)
    || (value.postId !== undefined && (typeof value.postId !== "string" || !/^[A-Za-z0-9_-]{1,200}$/.test(value.postId)))
    || (value.status === "succeeded" && (!value.postId || !/^[a-f0-9]{64}$/.test(value.remoteHash)))
    || (value.recoveredContentHash !== undefined && (value.status !== 'succeeded' || typeof value.recoveredContentHash !== 'string' || !/^[a-f0-9]{64}$/.test(value.recoveredContentHash)))) fail("VELOG_STORAGE_FAILED", "The local journal is invalid.");
  return value;
}
export function saveJournal(file, value) {
  const temporary = `${file}.${randomUUID()}.tmp`;
  let fd;
  try {
    fd = openSync(temporary, "wx", 0o600);
    writeFileSync(fd, JSON.stringify(value, null, 2) + "\n"); fsyncSync(fd);
    closeSync(fd); fd = undefined;
    renameSync(temporary, file);
    syncDirectory(path.dirname(file));
  } catch { fail("VELOG_STORAGE_FAILED", "Could not persist the operation. Inspect local and remote state before retrying."); }
  finally { if (fd !== undefined) closeSync(fd); try { unlinkSync(temporary); } catch { /* Already renamed. */ } }
}
export async function locked(file, action) {
  const lock = `${file}.lock`;
  let fd;
  try { fd = openSync(lock, "wx", 0o600); }
  catch { fail("VELOG_LOCKED", "A current or interrupted operation holds the lock. Inspect its outcome before removing it."); }
  try { return await action(); }
  finally {
    try { closeSync(fd); unlinkSync(lock); }
    catch { fail("VELOG_CLEANUP_FAILED", "Lock cleanup failed. An upload may have completed; inspect local and remote state."); }
  }
}
