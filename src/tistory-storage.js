import { mkdirSync, lstatSync, realpathSync, openSync, writeFileSync, closeSync, fsyncSync, renameSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { fail, readBounded } from './core.js';

export const hash = value => createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex');
function syncDir(directory) {
  if (process.platform === 'win32') return;
  const fd = openSync(directory, 'r');
  try { fsyncSync(fd); } finally { closeSync(fd); }
}
export function directories(root, names, create, sharedFirst = false) {
  let directory = realpathSync(root);
  for (const [index, name] of names.entries()) {
    const next = path.join(directory, name);
    if (create) {
      try { mkdirSync(next, { mode: 0o700 }); syncDir(directory); }
      catch (e) { if (e.code !== 'EEXIST') fail('TISTORY_STORAGE_FAILED', 'Cannot create private Postrail storage.'); }
    }
    let stat;
    try { stat = lstatSync(next); } catch (e) { if (!create && e.code === 'ENOENT') return undefined; throw e; }
    if (!stat.isDirectory() || stat.isSymbolicLink()) fail('TISTORY_STORAGE_FAILED', 'Postrail storage must use real directories.');
    if (!(sharedFirst && index === 0) && process.platform !== 'win32' && (stat.mode & 0o077)) fail('TISTORY_STORAGE_PERMISSIONS', 'Private Postrail directories require mode 0700.');
    directory = next;
  }
  return directory;
}
export function journalPath(cwd, target, articleId, create) {
  const dir = directories(cwd, ['.postrail', 'tistory', hash([target.blog, target.blogId, articleId])], create, true);
  return dir && path.join(dir, 'state.json');
}
export function readJournal(file, target, articleId) {
  if (!file) return undefined;
  try { const s = lstatSync(file); if (!s.isFile() || s.isSymbolicLink()) fail('TISTORY_STORAGE_FAILED', 'Invalid journal file.'); }
  catch (e) { if (e.code === 'ENOENT') return undefined; throw e; }
  let value;
  try { value = JSON.parse(readBounded(file, 65536, 'TISTORY_STORAGE_FAILED').toString('utf8')); }
  catch { fail('TISTORY_STORAGE_FAILED', 'Cannot read the journal. Inspect the remote result before changing it.'); }
  if (!value || value.version !== 1 || value.blog !== target.blog || value.blogId !== target.blogId || value.articleId !== articleId
    || !['pending', 'unknown', 'succeeded'].includes(value.status) || !/^[a-f0-9]{64}$/.test(value.contentHash ?? '')
    || (value.postId !== undefined && (typeof value.postId !== 'string' || !/^[1-9][0-9]{0,15}$/.test(value.postId)))
    || (value.recoveredContentHash !== undefined && (value.status !== 'succeeded' || !/^[a-f0-9]{64}$/.test(value.recoveredContentHash)))
    || (value.status === 'succeeded' && (!value.postId || !/^[a-f0-9]{64}$/.test(value.remoteHash ?? '')))) fail('TISTORY_STORAGE_FAILED', 'Invalid journal identity or state.');
  return value;
}
export function saveJournal(file, state) {
  const temporary = `${file}.${randomUUID()}.tmp`; let fd;
  try {
    fd = openSync(temporary, 'wx', 0o600); writeFileSync(fd, JSON.stringify(state, null, 2) + '\n'); fsyncSync(fd);
    closeSync(fd); fd = undefined; renameSync(temporary, file); syncDir(path.dirname(file));
  } catch { fail('TISTORY_STORAGE_FAILED', 'Cannot persist the result. Inspect local and remote state before retrying.'); }
  finally { if (fd !== undefined) closeSync(fd); try { unlinkSync(temporary); } catch { /* already renamed */ } }
}
export async function locked(file, action) {
  let fd; const lock = file + '.lock';
  try { fd = openSync(lock, 'wx', 0o600); } catch { fail('TISTORY_LOCKED', 'An active or interrupted operation holds this article lock. Inspect its result first.'); }
  try { return await action(); }
  finally { try { closeSync(fd); unlinkSync(lock); } catch { fail('TISTORY_CLEANUP_FAILED', 'Lock cleanup failed. An upload may have completed; inspect the result.'); } }
}
