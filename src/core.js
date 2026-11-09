import { constants, openSync, fstatSync, readSync, closeSync, realpathSync, lstatSync, writeFileSync } from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { parseDocument } from "yaml";
import MarkdownIt from "markdown-it";

export const PLATFORMS = ["velog", "tistory", "keyflow", "blogger"];
export class UserError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}
export function fail(code, message) { throw new UserError(code, message); }
const hash = value => createHash("sha256").update(value).digest("hex");

export function readBounded(file, limit, code = "READ_FAILED") {
  let fd;
  try {
    fd = openSync(file, constants.O_RDONLY | constants.O_NONBLOCK);
    const stat = fstatSync(fd);
    if (!stat.isFile()) fail(code, "Expected a regular file.");
    if (stat.size > limit) fail(code, "File exceeds the supported size limit.");
    // Bound the read even if the file grows after fstat.
    const buffer = Buffer.alloc(limit + 1);
    let offset = 0;
    while (offset < buffer.length) {
      const count = readSync(fd, buffer, offset, buffer.length - offset, null);
      if (!count) break;
      offset += count;
    }
    if (offset > limit) fail(code, "File exceeds the supported size limit.");
    return buffer.subarray(0, offset);
  } catch (error) {
    if (error instanceof UserError) throw error;
    fail(code, "Cannot read the requested file.");
  } finally { if (fd !== undefined) closeSync(fd); }
}

function keys(value, allowed, code) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) fail(code, "Expected a metadata object.");
  if (Object.keys(value).some(key => !allowed.includes(key))) fail(code, "Unknown metadata field.");
}
export function targets(value, code = "INVALID_METADATA") {
  if (!Array.isArray(value) || !value.length || value.some(p => !PLATFORMS.includes(p)) || new Set(value).size !== value.length) {
    fail(code, "Targets must be a nonempty list of unique platforms: velog, tistory, keyflow, blogger.");
  }
  return value;
}
function visibility(value, code) {
  if (!["draft", "private", "public"].includes(value)) fail(code, "Visibility must be draft, private, or public.");
  return value;
}
export function loadConfig(file, explicit = false) {
  let value;
  try { lstatSync(file); }
  catch (error) {
    if (!explicit && error.code === "ENOENT") return { version: 1, targets: PLATFORMS, visibility: "draft" };
    fail("INVALID_CONFIG", "Cannot read the project configuration.");
  }
  try { value = JSON.parse(readBounded(file, 64 * 1024, "INVALID_CONFIG").toString("utf8")); }
  catch (error) {
    if (error instanceof UserError) throw error;
    fail("INVALID_CONFIG", "Configuration must be valid JSON.");
  }
  keys(value, ["version", "targets", "visibility"], "INVALID_CONFIG");
  if (value.version !== 1) fail("INVALID_CONFIG", "Configuration version must be 1.");
  return { version: 1, targets: targets(value.targets, "INVALID_CONFIG"), visibility: visibility(value.visibility, "INVALID_CONFIG") };
}

export function initialize(cwd) {
  const file = path.join(cwd, "postrail.json");
  writeNew(file, JSON.stringify({ version: 1, targets: PLATFORMS, visibility: "draft" }, null, 2) + "\n");
  return file;
}
export function writeNew(file, content) {
  try { writeFileSync(file, content, { flag: "wx", mode: 0o600 }); }
  catch (error) {
    if (error.code === "EEXIST") fail("FILE_EXISTS", "Output already exists; choose a new path.");
    fail("WRITE_FAILED", "Cannot write the requested output file.");
  }
}

export function markdown() {
  const md = new MarkdownIt({ html: false, linkify: false, typographer: false });
  const originalValidate = md.validateLink.bind(md);
  md.validateLink = url => originalValidate(url) && (
    !/^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(url) || /^(?:https?:|mailto:)/i.test(url)
  );
  return md;
}

export function loadArticle(file, config, overrideTargets) {
  const bytes = readBounded(file, 2 * 1024 * 1024);
  let source;
  try { source = new TextDecoder("utf-8", { fatal: true }).decode(bytes).replace(/^\uFEFF/, "").replace(/\r\n/g, "\n"); }
  catch { fail("INVALID_ARTICLE", "Article must use UTF-8 encoding."); }
  const match = /^---\n([\s\S]*?)\n---(?:\n|$)/.exec(source);
  if (!match) fail("INVALID_METADATA", "Start the article with YAML frontmatter delimited by --- lines.");
  if (match[1].length > 32 * 1024) fail("INVALID_METADATA", "Frontmatter is too large.");
  let meta;
  try {
    const doc = parseDocument(match[1], { uniqueKeys: true, stringKeys: true, prettyErrors: false });
    if (doc.errors.length || doc.warnings.length) fail("INVALID_METADATA", "Frontmatter must be valid YAML without duplicate keys or custom tags.");
    meta = doc.toJS({ maxAliasCount: 0 });
  } catch { fail("INVALID_METADATA", "Frontmatter must be valid YAML without duplicate keys, custom tags or aliases."); }
  keys(meta, ["id", "title", "tags", "visibility", "targets"], "INVALID_METADATA");
  if (typeof meta.id !== "string" || !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/.test(meta.id)) fail("INVALID_METADATA", "Article id must contain 1–128 ASCII letters, digits, dots, underscores, or hyphens.");
  if (typeof meta.title !== "string" || !meta.title.trim() || meta.title.length > 200 || /[\x00-\x1f\x7f]/.test(meta.title)) fail("INVALID_METADATA", "Title must be a nonempty single line of at most 200 characters.");
  const tags = meta.tags === undefined ? [] : meta.tags;
  if (!Array.isArray(tags) || tags.length > 30 || tags.some(t => typeof t !== "string" || !t.trim() || t !== t.trim() || t.length > 100 || /[\x00-\x1f\x7f]/.test(t)) || new Set(tags).size !== tags.length) fail("INVALID_METADATA", "Tags must be unique nonempty strings (up to 30 tags, 100 characters each).");
  const articleTargets = meta.targets === undefined ? config.targets : targets(meta.targets);
  const chosenTargets = overrideTargets === undefined ? articleTargets : targets(overrideTargets);
  const chosenVisibility = visibility(meta.visibility === undefined ? config.visibility : meta.visibility, "INVALID_METADATA");
  const body = source.slice(match[0].length);
  if (!body.trim()) fail("INVALID_ARTICLE", "Article body must not be empty.");
  const md = markdown();
  const tokens = md.parse(body, {});
  const images = new Map();
  const warnings = new Set();
  const base = path.dirname(realpathSync(file));
  let imageBytes = 0;
  function inspect(tokens) {
    for (const token of tokens) {
      if (token.type === "image") {
        const src = token.attrGet("src");
        if (!images.has(src)) {
          if (/^https?:\/\//i.test(src) || src.startsWith("//")) {
            images.set(src, { kind: "remote", source: src });
            warnings.add("REMOTE_IMAGES_NOT_FETCHED");
          } else {
            let decoded;
            try { decoded = decodeURIComponent(src); } catch { fail("INVALID_IMAGE", "Image path has invalid encoding."); }
            if (!decoded || /[\x00-\x1f\\?#]/.test(decoded) || decoded.startsWith("/") || /^[a-z][a-z0-9+.-]*:/i.test(decoded)) fail("INVALID_IMAGE", "Images must use relative file paths or HTTP(S) URLs.");
            let absolute;
            try { absolute = realpathSync(path.resolve(base, decoded)); }
            catch { fail("INVALID_IMAGE", "Local image does not exist."); }
            const relative = path.relative(base, absolute);
            if (relative.startsWith(`..${path.sep}`) || relative === ".." || path.isAbsolute(relative)) fail("INVALID_IMAGE", "Local images must stay inside the article directory, including symlink targets.");
            const data = readBounded(absolute, 5 * 1024 * 1024, "INVALID_IMAGE");
            imageBytes += data.length;
            if (imageBytes > 20 * 1024 * 1024) fail("INVALID_IMAGE", "Combined local images exceed the supported size limit.");
            const extension = path.extname(absolute).toLowerCase();
            let mime;
            if (extension === ".png" && data.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) mime = "image/png";
            else if ([".jpg", ".jpeg"].includes(extension) && data[0] === 255 && data[1] === 216 && data[2] === 255) mime = "image/jpeg";
            else if (extension === ".gif" && ["GIF87a", "GIF89a"].includes(data.subarray(0, 6).toString())) mime = "image/gif";
            else if (extension === ".webp" && data.subarray(0, 4).toString() === "RIFF" && data.subarray(8, 12).toString() === "WEBP") mime = "image/webp";
            else fail("INVALID_IMAGE", "Local images must be PNG, JPEG, GIF, or WebP with matching file signatures.");
            images.set(src, { kind: "local", source: src, mime, data });
          }
        }
      }
      if (token.children) inspect(token.children);
    }
  }
  inspect(tokens);
  const metaResult = { id: meta.id, title: meta.title.trim(), tags, visibility: chosenVisibility, targets: chosenTargets };
  const imageHashes = [...images.values()].filter(i => i.kind === "local").map(i => [i.source, hash(i.data)]);
  return { meta: metaResult, body, md, tokens, images, warnings: [...warnings], contentHash: hash(JSON.stringify({ ...metaResult, body, imageHashes })) };
}

export function summary(article) {
  return { ...article.meta, contentHash: article.contentHash, images: [...article.images.values()].map(({ kind, source }) => ({ kind, source })), warnings: article.warnings };
}

export function preview(article) {
  const md = markdown();
  const escape = md.utils.escapeHtml;
  const imageRule = md.renderer.rules.image;
  md.renderer.rules.image = (tokens, index, options, env, self) => {
    const token = tokens[index];
    const image = article.images.get(token.attrGet("src"));
    if (!image || image.kind === "remote") return `<span class="image-placeholder">${escape(token.content || "Remote image")} (external image omitted)</span>`;
    // Renderer rules mutate attrs (including alt); keep the parsed article reusable.
    const renderedTokens = tokens.slice();
    const clone = Object.assign(Object.create(Object.getPrototypeOf(token)), token);
    clone.attrs = token.attrs.map(attr => [...attr]);
    clone.attrSet("src", `data:${image.mime};base64,${image.data.toString("base64")}`);
    renderedTokens[index] = clone;
    return imageRule(renderedTokens, index, options, env, self);
  };
  const html = md.renderer.render(article.tokens, md.options, {});
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'">
<meta name="referrer" content="no-referrer"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escape(article.meta.title)} — Postrail preview</title>
<style>body{font:17px/1.7 system-ui,sans-serif;margin:40px auto;padding:0 24px;max-width:820px;overflow-wrap:anywhere;color:#20242c;background:#fafbfc}h1{line-height:1.3}pre{overflow:auto;padding:16px;background:#eef0f4;border-radius:8px}code{font-family:monospace}table{border-collapse:collapse;display:block;overflow:auto}th,td{border:1px solid #ccd1da;padding:8px 12px}img{max-width:100%;height:auto}.notice,.image-placeholder{color:#555d6b;background:#eef0f4;padding:8px;border-radius:4px}a{color:#254fbe}blockquote{border-left:3px solid #ccd1da;margin-left:0;padding-left:20px}</style>
</head><body><p class="notice">Local preview · ${escape(article.meta.visibility)} · no content uploaded</p>
<h1>${escape(article.meta.title)}</h1>${html}</body></html>\n`;
}
