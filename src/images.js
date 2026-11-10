import { openSync, fstatSync, readSync, closeSync, constants, realpathSync } from 'node:fs';
import path from 'node:path';
import { parseArticle, localImagePath, imageMime, fail, UserError } from './core.js';

export const IMAGE_LIMIT = 5 * 1024 * 1024;
export const TOTAL_IMAGE_LIMIT = 20 * 1024 * 1024;

// Inventory only: bounded header reads, no image conversion, credentials or network.
export function inspectImages(file, config) {
  const article = parseArticle(file, config);
  const base = path.dirname(realpathSync(file));
  const images = new Map(), files = new Map();
  function visit(tokens) {
    for (const token of tokens) {
      if (token.type === 'image') {
        const source = token.attrGet('src');
        if (images.has(source)) images.get(source).occurrences++;
        else if (/^https?:\/\//i.test(source) || source.startsWith('//')) images.set(source, { source, kind: 'remote', occurrences: 1 });
        else {
          const absolute = localImagePath(base, source);
          let fd, bytes, mime;
          try {
            fd = openSync(absolute, constants.O_RDONLY | constants.O_NONBLOCK);
            const stat = fstatSync(fd);
            if (!stat.isFile() || !Number.isSafeInteger(stat.size)) fail('INVALID_IMAGE', 'Expected a regular local image file.');
            bytes = stat.size;
            const header = Buffer.alloc(12);
            const count = readSync(fd, header, 0, header.length, 0);
            mime = imageMime(absolute, header.subarray(0, count));
          } catch (error) {
            if (error instanceof UserError) throw error;
            fail('INVALID_IMAGE', 'Cannot inspect the local image.');
          } finally { if (fd !== undefined) closeSync(fd); }
          files.set(absolute, bytes);
          images.set(source, { source, kind: 'local', occurrences: 1, mime, bytes, excessBytes: Math.max(0, bytes - IMAGE_LIMIT) });
        }
      }
      if (token.children) visit(token.children);
    }
  }
  visit(article.tokens);
  const local = [...images.values()].filter(image => image.kind === 'local');
  const totalBytes = local.reduce((sum, image) => sum + image.bytes, 0);
  const excessBytes = Math.max(0, totalBytes - TOTAL_IMAGE_LIMIT);
  return { ok: !excessBytes && local.every(image => !image.excessBytes), command: 'images', offline: true,
    title: article.meta.title, images: [...images.values()], limits: { fileBytes: IMAGE_LIMIT, totalBytes: TOTAL_IMAGE_LIMIT },
    totalBytes, excessBytes, uniqueFiles: files.size, uniqueFileBytes: [...files.values()].reduce((sum, bytes) => sum + bytes, 0),
    guidance: ['Repeated identical source paths count once; different source aliases count separately toward the publishing budget.',
      'Remote images are not fetched or included in local byte totals. This is a size/signature inventory, not a full image decoder or platform preflight.',
      'Prepare smaller copies in a separate directory under the article folder, update Markdown paths, then run images and validate again. Original files are never changed.'] };
}
