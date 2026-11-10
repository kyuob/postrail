import { mkdirSync, lstatSync, realpathSync, openSync, closeSync, fsyncSync, writeFileSync, renameSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { fail, readBounded } from './core.js';

export const digest = value => createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex');
function syncDir(dir) {
  if (process.platform === 'win32') return;
  const fd = openSync(dir, 'r'); try { fsyncSync(fd); } finally { closeSync(fd); }
}
export function storage(root, names, create, sharedFirst = false) {
  let current = realpathSync(root);
  for (const [index, name] of names.entries()) {
    const next = path.join(current, name);
    if (create) {
      try { mkdirSync(next, { mode: 0o700 }); syncDir(current); }
      catch (e) { if (e.code !== 'EEXIST') fail('BLOGGER_STORAGE_FAILED', 'Cannot create private Postrail storage.'); }
    }
    let stat;
    try { stat = lstatSync(next); } catch (e) { if (!create && e.code === 'ENOENT') return undefined; throw e; }
    if (!stat.isDirectory() || stat.isSymbolicLink()) fail('BLOGGER_STORAGE_FAILED', 'Postrail storage requires real directories.');
    if (!(sharedFirst && index === 0) && process.platform !== 'win32' && (stat.mode & 0o077)) fail('BLOGGER_STORAGE_PERMISSIONS', 'Private Postrail directories require mode 0700.');
    current = next;
  }
  return current;
}
export function readPrivate(file) {
  if (!file) return undefined;
  let stat;
  try { stat = lstatSync(file); } catch (e) { if (e.code === 'ENOENT') return undefined; throw e; }
  if (!stat.isFile() || stat.isSymbolicLink() || process.platform !== 'win32' && (stat.mode & 0o077)) fail('BLOGGER_STORAGE_PERMISSIONS', 'Private files require regular files with mode 0600.');
  try { return JSON.parse(readBounded(file, 65536, 'BLOGGER_STORAGE_FAILED').toString('utf8')); }
  catch { fail('BLOGGER_STORAGE_FAILED', 'Cannot read private Postrail data. Inspect its state before changing it.'); }
}
export function savePrivate(file, value) {
  const temporary = `${file}.${randomUUID()}.tmp`; let fd;
  try {
    fd = openSync(temporary, 'wx', 0o600); writeFileSync(fd, JSON.stringify(value, null, 2) + '\n'); fsyncSync(fd);
    closeSync(fd); fd = undefined; renameSync(temporary, file); syncDir(path.dirname(file));
  } catch { fail('BLOGGER_STORAGE_FAILED', 'Cannot persist private data. Inspect local and remote results before retrying.'); }
  finally { if (fd !== undefined) closeSync(fd); try { unlinkSync(temporary); } catch { /* already renamed */ } }
}
export async function locked(file, action) {
  const lock = file + '.lock'; let fd;
  try { fd = openSync(lock, 'wx', 0o600); } catch { fail('BLOGGER_LOCKED', 'An active or interrupted operation holds this lock. Inspect its result first.'); }
  try { return await action(); }
  finally { try { closeSync(fd); unlinkSync(lock); } catch { fail('BLOGGER_CLEANUP_FAILED', 'Lock cleanup failed. Inspect the operation result before retrying.'); } }
}
export function journalPath(cwd, account, blogId, articleId, create) {
  const dir = storage(cwd, ['.postrail', 'blogger', digest([account, blogId, articleId])], create, true);
  return dir && path.join(dir, 'state.json');
}
export function readJournal(file, account, blogId, articleId) {
  const state = readPrivate(file);
  if (!state) return undefined;
  if (state.version !== 1 || state.account !== account || state.blogId !== blogId || state.articleId !== articleId
    || typeof state.userId !== 'string' || !/^[0-9]{1,30}$/.test(state.userId) || !['pending', 'unknown', 'succeeded'].includes(state.status)
    || !/^[a-f0-9]{64}$/.test(state.contentHash ?? '') || state.postId !== undefined && (typeof state.postId !== 'string' || !/^[0-9]{1,30}$/.test(state.postId))
    || state.recoveredContentHash !== undefined && (state.status !== 'succeeded' || !/^[a-f0-9]{64}$/.test(state.recoveredContentHash))
    || state.status === 'succeeded' && (!state.postId || !/^[a-f0-9]{64}$/.test(state.remoteHash ?? ''))) fail('BLOGGER_STORAGE_FAILED', 'Invalid article journal identity or state.');
  return state;
}
