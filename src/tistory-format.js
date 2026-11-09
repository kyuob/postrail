import JSON5 from 'json5';
import { parseFragment } from 'parse5';
import { imageSize } from 'image-size';
import { fail } from './core.js';

// Parse only literal data. Server scripts are never executed (including in a VM).
export function editorConfig(html) {
  const scripts = [];
  function walk(node) {
    if (node.tagName === 'script') scripts.push((node.childNodes ?? []).map(n => n.value ?? '').join(''));
    for (const child of node.childNodes ?? []) walk(child);
  }
  walk(parseFragment(html));
  const found = [];
  for (const script of scripts) {
    const matches = [...script.matchAll(/(?:^|[;\n])\s*window\.Config\s*=\s*(\{)/g)];
    for (const match of matches) {
      const start = match.index + match[0].lastIndexOf('{');
      let depth = 0, quote, comment;
      for (let i = start; i < script.length; i++) {
        const c = script[i], n = script[i + 1];
        if (comment === 'line') { if (c === '\n') comment = undefined; continue; }
        if (comment === 'block') { if (c === '*' && n === '/') { comment = undefined; i++; } continue; }
        if (quote) { if (c === '\\') i++; else if (c === quote) quote = undefined; continue; }
        if (c === '/' && n === '/') { comment = 'line'; i++; continue; }
        if (c === '/' && n === '*') { comment = 'block'; i++; continue; }
        if (c === '"' || c === "'") { quote = c; continue; }
        if (c === '{') depth++;
        if (c === '}' && --depth === 0) {
          try { found.push(JSON5.parse(script.slice(start, i + 1))); }
          catch { fail('TISTORY_SCHEMA_UNSUPPORTED', 'The editor configuration is not a supported data literal. No server script was executed.'); }
          break;
        }
      }
    }
  }
  if (found.length !== 1 || !found[0] || typeof found[0] !== 'object' || Array.isArray(found[0])) fail('TISTORY_SCHEMA_UNSUPPORTED', 'A single supported editor configuration was not found.');
  return found[0];
}
export function verifyBlog(config, target) {
  const blog = config.blog;
  let domain;
  try { domain = new URL(blog?.domain?.includes('://') ? blog.domain : `https://${blog?.domain}`).hostname; } catch { /* reject below */ }
  if (domain !== target.host || String(blog?.blogSettings?.blogId) !== target.blogId) fail('TISTORY_BLOG_MISMATCH', 'The authenticated editor does not match the requested blog and blog ID.');
}
export function postFromConfig(config, target, id) {
  verifyBlog(config, target);
  const e = config.entry;
  if (!e || String(e.id) !== id || typeof e.title !== 'string' || typeof e.content !== 'string'
    || ![0, 20].includes(e.visibility) || !Number.isSafeInteger(Number(e.categoryId)) || Number(e.categoryId) < 0
    || !(typeof e.tags === 'string' || Array.isArray(e.tags) && e.tags.every(t => typeof t === 'string'))
    || typeof e.slogan !== 'string') fail('TISTORY_SCHEMA_UNSUPPORTED', 'The owned editor post has unsupported or incomplete fields.');
  return { id, title: e.title, content: e.content, visibility: e.visibility, category: Number(e.categoryId),
    tags: Array.isArray(e.tags) ? e.tags : e.tags.split(',').map(t => t.trim()).filter(Boolean), slogan: e.slogan,
    // Fingerprint every editor field so unhandled external edits cannot silently disappear.
    editor: e };
}
export function canonicalHtml(html) {
  function node(n) {
    if (n.nodeName === '#text') return n.value;
    if (n.nodeName === '#comment') return ['comment', n.data];
    return [n.tagName ?? 'root', (n.attrs ?? []).filter(a => !(n.tagName === 'p' && a.name === 'data-ke-size')
      && !(/^h[1-6]$/.test(n.tagName ?? '') && a.name === 'id' && /^tm-h-\d+$/.test(a.value)))
      .map(a => [a.name, a.value]).sort((a, b) => a[0].localeCompare(b[0])), (n.childNodes ?? []).map(node)];
  }
  return JSON.stringify(node(parseFragment(html)));
}
export function attachment(upload) {
  let url;
  try { url = new URL(upload.url); } catch { fail('TISTORY_IMAGE_FAILED', 'No supported upload URL was returned.'); }
  if (url.origin !== 'https://blog.kakaocdn.net' || !url.pathname.startsWith('/dna/') || url.hash || url.username || url.password
    || typeof upload.key !== 'string' || !/^[A-Za-z0-9_/-]+$/.test(upload.key) || upload.key.includes('..')
    || typeof upload.filename !== 'string' || !/^[A-Za-z0-9_.-]+$/.test(upload.filename)
    || url.pathname !== `/dna/${upload.key}/${upload.filename}` || !url.search || /[|<>\r\n]/.test(url.search)) fail('TISTORY_IMAGE_FAILED', 'The upload reference has an unexpected destination or format.');
  return `kage@${upload.key}/${upload.filename}${url.search.replace(/&/g, '&amp;')}`;
}
export function renderTistory(article, uploaded = new Map()) {
  const md = article.md; const original = md.renderer.rules.image;
  md.renderer.rules.image = (tokens, index, options, env, self) => {
    const token = tokens[index], source = token.attrGet('src');
    if (article.images.get(source)?.kind !== 'local') return original(tokens, index, options, env, self);
    const ref = uploaded.get(source);
    if (!ref) fail('TISTORY_IMAGE_FAILED', 'An image upload reference is missing.');
    let size;
    try { size = imageSize(article.images.get(source).data); } catch { fail('TISTORY_IMAGE_FAILED', 'The image dimensions could not be read.'); }
    if (!Number.isSafeInteger(size.width) || !Number.isSafeInteger(size.height) || size.width <= 0 || size.height <= 0) fail('TISTORY_IMAGE_FAILED', 'Unsupported image dimensions.');
    // Retain alt/title as escaped HTML caption text outside the platform substitution.
    const caption = md.utils.escapeHtml(token.content || token.attrGet('title') || '');
    return `[##_Image|${ref}|CDM|1.3|${JSON.stringify({ originWidth: size.width, originHeight: size.height, style: 'alignCenter' })}_##]${caption ? `<span>${caption}</span>` : ''}`;
  };
  try { return md.renderer.render(article.tokens, md.options, {}); }
  finally { md.renderer.rules.image = original; }
}
