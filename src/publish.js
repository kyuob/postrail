import { mkdirSync, lstatSync, realpathSync, openSync, closeSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fail, readBounded, UserError, PLATFORMS } from './core.js';
import { velogAccount } from './velog-client.js';
import { checkVelog, pushVelog } from './velog.js';
import { tistoryTarget } from './tistory-client.js';
import { checkTistory, pushTistory } from './tistory.js';
import { accountName as bloggerAccount, numericId } from './blogger-client.js';
import { checkBlogger, pushBlogger } from './blogger.js';
import { accountName as keyflowAccount, pushKeyflow } from './keyflow.js';

function object(value, allowed) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(k => !allowed.includes(k))) fail('PUBLISH_DESTINATIONS_INVALID', 'Destinations must contain only the documented account and blog fields; never include credentials.');
}
export function loadDestinations(file) {
  let value;
  try { value = JSON.parse(readBounded(file, 65536, 'PUBLISH_DESTINATIONS_INVALID').toString('utf8')); }
  catch { fail('PUBLISH_DESTINATIONS_INVALID', 'Cannot read a valid destinations JSON file.'); }
  object(value, ['version', 'destinations']);
  if (value.version !== 1) fail('PUBLISH_DESTINATIONS_INVALID', 'Destinations version must be 1.');
  object(value.destinations, PLATFORMS);
  for (const [platform, destination] of Object.entries(value.destinations)) {
    object(destination, platform === 'tistory' ? ['blog', 'blogId'] : platform === 'blogger' ? ['account', 'blogId'] : ['account']);
    if (platform === 'velog') velogAccount(destination.account);
    if (platform === 'keyflow') keyflowAccount(destination.account);
    if (platform === 'tistory') tistoryTarget(destination.blog, destination.blogId);
    if (platform === 'blogger') { bloggerAccount(destination.account); numericId(destination.blogId); }
  }
  return value.destinations;
}
const adapters = {
  velog: { check: checkVelog, push: (a, d, cwd) => pushVelog(a, d.account, cwd, true) },
  tistory: { check: checkTistory, push: (a, d, cwd) => pushTistory(a, tistoryTarget(d.blog, d.blogId), cwd, true) },
  blogger: { check: checkBlogger, push: (a, d, cwd) => pushBlogger(a, d.account, d.blogId, cwd, true) },
  // Do not run the official KeyFlow CLI during common offline preflight.
  keyflow: { check: () => ({ blockers: [] }), push: (a, d, cwd) => pushKeyflow(a, d.account, cwd, true) },
};
export function publishCapabilities(article) {
  return article.meta.targets.map(platform => ({ platform, visibility: article.meta.visibility,
    status: platform === 'keyflow' ? 'implemented' : 'experimental', canPublish: false,
    blockers: ['DESTINATIONS_REQUIRED', 'CONFIRM_REQUIRED', ...(adapters[platform].check(article).blockers ?? [])] }));
}
async function locked(cwd, id, action) {
  let directory = realpathSync(cwd);
  for (const name of ['.postrail', 'publish']) {
    directory = path.join(directory, name);
    try { mkdirSync(directory, { mode: 0o700 }); } catch (e) { if (e.code !== 'EEXIST') fail('PUBLISH_STORAGE_FAILED', 'Cannot create the local publish lock directory.'); }
    const stat = lstatSync(directory);
    if (stat.isSymbolicLink() || !stat.isDirectory() || name === 'publish' && process.platform !== 'win32' && (stat.mode & 0o077)) fail('PUBLISH_STORAGE_FAILED', 'Publish locks require real private directories.');
  }
  const file = path.join(directory, createHash('sha256').update(id).digest('hex') + '.lock');
  let fd;
  try { fd = openSync(file, 'wx', 0o600); }
  catch { fail('PUBLISH_LOCKED', 'Another active or interrupted publish holds this article lock. Inspect platform journals before removing an abandoned lock.'); }
  try { return await action(); }
  finally { closeSync(fd); unlinkSync(file); }
}
export async function publishArticle(article, destinations, cwd, { confirmed = false, dryRun = false } = {}, implementations = adapters) {
  if (!dryRun && !confirmed) fail('PUBLISH_CONFIRM_REQUIRED', 'Review the article, destinations and visibility; pass --confirm to send it.');
  const preflight = article.meta.targets.map(platform => {
    if (!Object.hasOwn(destinations, platform)) fail('PUBLISH_DESTINATION_REQUIRED', 'Every selected platform needs an explicit destination.');
    const checked = implementations[platform].check(article);
    return { platform, visibility: article.meta.visibility, blockers: checked.blockers ?? [] };
  });
  const blocked = preflight.some(t => t.blockers.length);
  if (dryRun || blocked) return { ok: !blocked, command: 'publish', offline: true, dryRun, preflight, results: [] };
  return locked(cwd, article.meta.id, async () => {
    const results = [];
    for (const { platform } of preflight) {
      try {
        const result = await implementations[platform].push(article, destinations[platform], cwd);
        if (result?.ok !== true || typeof result.postId !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,199}$/.test(result.postId)) fail('PUBLISH_RESULT_INVALID', 'The adapter did not confirm a saved post.');
        results.push({ platform, status: result.skipped ? 'skipped' : 'succeeded', postId: result.postId });
      } catch (error) {
        const code = error instanceof UserError && /^(?:VELOG|TISTORY|BLOGGER|KEYFLOW|PUBLISH)_[A-Z_]+$/.test(error.code) ? error.code : 'PUBLISH_TARGET_FAILED';
        results.push({ platform, status: 'failed', error: { code }, automaticRetry: false });
      }
    }
    return { ok: results.every(r => r.status !== 'failed'), command: 'publish', offline: false, results };
  });
}
