import { fail, contentHashForTargets } from './core.js';
import { journalSnapshot, fingerprint, reconcileJournal } from './recovery-journal.js';
import { verifyImageBytes } from './recovery-images.js';
import { equivalentTags, distinctTagIdentities } from './tags.js';
import { withTistorySession } from './tistory-client.js';
import * as tistory from './tistory.js';
import * as ts from './tistory-storage.js';
import { attachment, renderTistory, canonicalHtml } from './tistory-format.js';
import { withBloggerSession } from './blogger-auth.js';
import { accountName, numericId } from './blogger-client.js';
import * as blogger from './blogger.js';
import * as bs from './blogger-storage.js';

const sourceMatches = (article, state, platform) => [article.contentHash, contentHashForTargets(article, [platform])].includes(state.contentHash);
function result(platform, article, snap, post, comparisons, tags, visibility, identity) {
  const canReconcile = ['pending', 'unknown'].includes(snap.state.status)
    && Object.entries(comparisons).every(([key, value]) => key === 'tags' || value)
    && distinctTagIdentities(article.meta.tags) && distinctTagIdentities(tags);
  return { ok: true, command: `${platform} inspect`, readOnly: true, postId: snap.state.postId, localStatus: snap.state.status,
    comparisons, tags: { intended: article.meta.tags, actual: tags }, visibility: { intended: article.meta.visibility, actual: visibility },
    canReconcile, requiresTagAcceptance: !comparisons.tags,
    reviewHash: fingerprint({ version: 1, platform, identity, source: article.contentHash, journal: snap.hash, post, comparisons }) };
}
async function tistoryBody(article, post, request) {
  const refs = [];
  function walk(tokens) { for (const token of tokens) { if (token.type === 'image' && article.images.get(token.attrGet('src'))?.kind === 'local') refs.push(token.attrGet('src')); if (token.children) walk(token.children); } }
  walk(article.tokens);
  const markers = [...post.content.matchAll(/\[##_Image\|([^|]+)\|CDM\|1\.3\|/g)], uploaded = new Map(), urls = new Map();
  const no = { body: false, images: refs.length === 0 };
  if (markers.length !== refs.length) return no;
  for (const [index, source] of refs.entries()) {
    const ref = markers[index][1];
    const match = /^kage@([A-Za-z0-9_/-]+)\/([A-Za-z0-9_.-]+)(\?[^|<>\r\n]+)$/.exec(ref);
    if (!match || uploaded.has(source) && uploaded.get(source) !== ref) return no;
    const [, key, filename, query] = match;
    const url = `https://blog.kakaocdn.net/dna/${key}/${filename}${query.replace(/&amp;/g, '&')}`;
    try { if (attachment({ key, filename, url }) !== ref) return no; } catch { return no; }
    uploaded.set(source, ref); urls.set(source, url);
  }
  if (canonicalHtml(post.content) !== canonicalHtml(renderTistory(article, uploaded))) return no;
  for (const [source, url] of urls) if (!await verifyImageBytes(url, article.images.get(source).data, request)) return { body: true, images: false };
  return { body: true, images: true };
}
function tistoryContext(article, target, cwd, session, request) {
  tistory.validateTarget(target); tistory.checkArticle(article, true);
  const file = ts.journalPath(cwd, target, article.meta.id, false), read = () => ts.readJournal(file, target, article.meta.id);
  const inspect = snap => session(target, async (client, actual) => {
    tistory.verifyIdentity(actual, target);
    const post = tistory.verifyPost(await client.read(snap.state.postId), snap.state.postId);
    const source = sourceMatches(article, snap.state, 'tistory');
    const body = source ? await tistoryBody(article, post, request) : { body: false, images: false };
    const comparisons = { source, title: post.title === article.meta.title, ...body, tags: equivalentTags(post.tags, article.meta.tags),
      visibility: post.visibility === (article.meta.visibility === 'private' ? 0 : 20) };
    const report = result('tistory', article, snap, post, comparisons, post.tags, post.visibility === 0 ? 'private' : 'public', target);
    report.preserved = { category: post.category, slogan: post.slogan, editorOptions: post.editorOptions };
    return { result: report, remoteHash: tistory.remoteHash(post) };
  });
  return { file, read, inspect };
}
export async function inspectTistory(article, target, cwd, session = withTistorySession, request = fetch) {
  const ctx = tistoryContext(article, target, cwd, session, request);
  return (await ctx.inspect(journalSnapshot(ctx.file, ctx.read, 'TISTORY'))).result;
}
export async function reconcileTistory(article, target, cwd, options = {}, session = withTistorySession, request = fetch) {
  const ctx = tistoryContext(article, target, cwd, session, request);
  return reconcileJournal({ ...ctx, save: ts.saveJournal, locked: ts.locked, prefix: 'TISTORY', options,
    sourceHash: contentHashForTargets(article, ['tistory']), extra: { formatVersion: tistory.formatVersion } });
}
function bloggerContext(article, account, blogId, cwd, session) {
  accountName(account); numericId(blogId); blogger.checkArticle(article, true);
  const file = bs.journalPath(cwd, account, blogId, article.meta.id, false), read = () => bs.readJournal(file, account, blogId, article.meta.id);
  const inspect = snap => session(account, async (client, user) => {
    blogger.verifyUser(user);
    if (user.id !== snap.state.userId) fail('BLOGGER_ACCOUNT_MISMATCH', 'The journal belongs to another Blogger user.');
    await client.target(blogId, user.id);
    const post = blogger.postResult(await client.read(blogId, snap.state.postId), blogId, snap.state.postId);
    const expected = article.md.renderer.render(article.tokens, article.md.options, {});
    const comparisons = { source: sourceMatches(article, snap.state, 'blogger'), title: post.title === article.meta.title,
      body: JSON.stringify(blogger.htmlValue(post.content)) === JSON.stringify(blogger.htmlValue(expected)),
      tags: JSON.stringify([...(post.labels ?? [])].sort()) === JSON.stringify([...article.meta.tags].sort()),
      visibility: post.status === (article.meta.visibility === 'draft' ? 'DRAFT' : 'LIVE'), images: true };
    return { result: result('blogger', article, snap, post, comparisons, post.labels ?? [], post.status === 'DRAFT' ? 'draft' : 'public', { account, blogId, userId: user.id }), remoteHash: blogger.remoteHash(post) };
  });
  return { file, read, inspect };
}
export async function inspectBlogger(article, account, blogId, cwd, session = withBloggerSession) {
  const ctx = bloggerContext(article, account, blogId, cwd, session);
  return (await ctx.inspect(journalSnapshot(ctx.file, ctx.read, 'BLOGGER'))).result;
}
export async function reconcileBlogger(article, account, blogId, cwd, options = {}, session = withBloggerSession) {
  const ctx = bloggerContext(article, account, blogId, cwd, session);
  return reconcileJournal({ ...ctx, save: bs.savePrivate, locked: bs.locked, prefix: 'BLOGGER', options, sourceHash: contentHashForTargets(article, ['blogger']) });
}
