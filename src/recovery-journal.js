import { lstatSync, openSync, closeSync, writeFileSync, fsyncSync } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { readBounded, fail } from './core.js';

export const fingerprint = value => createHash('sha256').update(Buffer.isBuffer(value) ? value : JSON.stringify(value)).digest('hex');
export function recoveryOptions(prefix, { confirmed = false, reviewHash } = {}) {
  if (!confirmed) fail(`${prefix}_RECOVERY_CONFIRM_REQUIRED`, 'Inspect the saved post, then explicitly confirm local reconciliation.');
  if (typeof reviewHash !== 'string' || !/^[a-f0-9]{64}$/.test(reviewHash)) fail(`${prefix}_RECOVERY_REVIEW_REQUIRED`, 'Pass the review hash from inspect.');
}
export function journalSnapshot(file, read, prefix) {
  const state = read();
  if (!state?.postId) fail(`${prefix}_NO_REMOTE_ID`, 'No saved post ID exists. Inspect the service; do not recreate the post.');
  const bytes = readBounded(file, 65536, `${prefix}_STORAGE_FAILED`);
  let parsed; try { parsed = JSON.parse(bytes); } catch { fail(`${prefix}_STORAGE_FAILED`, 'Cannot read the local journal.'); }
  if (fingerprint(parsed) !== fingerprint(state)) fail(`${prefix}_RECOVERY_STALE`, 'The journal changed. Inspect again.');
  return { state, bytes, hash: fingerprint(bytes) };
}
export function backupSnapshot(file, snap, prefix) {
  const parent = path.dirname(file), backup = `${file}.backup-${snap.hash}.json`; let fd;
  try {
    const dir = lstatSync(parent);
    if (!dir.isDirectory() || dir.isSymbolicLink() || process.platform !== 'win32' && dir.mode & 0o077) throw Error('Unsafe directory');
    try { fd = openSync(backup, 'wx', 0o600); writeFileSync(fd, snap.bytes); fsyncSync(fd); closeSync(fd); fd = undefined; }
    catch (error) {
      if (error.code !== 'EEXIST') throw error;
      const stat = lstatSync(backup);
      if (!stat.isFile() || stat.isSymbolicLink() || process.platform !== 'win32' && stat.mode & 0o077
        || fingerprint(readBounded(backup, 65536)) !== snap.hash) throw Error('Unsafe backup');
      fd = openSync(backup, 'r'); fsyncSync(fd); closeSync(fd); fd = undefined;
    }
    if (process.platform !== 'win32') { fd = openSync(parent, 'r'); fsyncSync(fd); closeSync(fd); fd = undefined; }
  } catch { fail(`${prefix}_RECOVERY_BACKUP_FAILED`, 'Cannot verify a private journal backup. The unresolved state was not replaced.'); }
  finally { if (fd !== undefined) closeSync(fd); }
}
export async function reconcileJournal({ file, read, save, locked, inspect, prefix, options, sourceHash, extra = {} }) {
  recoveryOptions(prefix, options);
  journalSnapshot(file, read, prefix);
  return locked(file, async () => {
    const snap = journalSnapshot(file, read, prefix);
    if (!['pending', 'unknown'].includes(snap.state.status)) fail(`${prefix}_RECOVERY_STATE_INVALID`, 'Only pending/unknown journals can be reconciled.');
    const checked = await inspect(snap);
    if (checked.result.reviewHash !== options.reviewHash) fail(`${prefix}_RECOVERY_STALE`, 'The source, journal or remote post changed. Inspect again.');
    if (!checked.result.canReconcile) fail(`${prefix}_RECOVERY_MISMATCH`, 'Source, ownership, title, body, images and visibility must match.');
    if (checked.result.requiresTagAcceptance && !options.acceptTags) fail(`${prefix}_RECOVERY_TAG_ACCEPT_REQUIRED`, 'Review remote tags and pass --accept-tags only if you accept the difference.');
    if (journalSnapshot(file, read, prefix).hash !== snap.hash) fail(`${prefix}_RECOVERY_STALE`, 'The journal changed during review.');
    backupSnapshot(file, snap, prefix);
    save(file, { ...snap.state, ...extra, status: 'succeeded', remoteHash: checked.remoteHash, recoveredContentHash: sourceHash });
    return { ok: true, command: `${prefix.toLowerCase()} reconcile`, postId: snap.state.postId, localStatus: 'succeeded', remoteWritten: false,
      acceptedTags: checked.result.requiresTagAcceptance, backupVerified: true };
  });
}
