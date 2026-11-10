import { createHash } from 'node:crypto';

// Credentials never accompany CDN requests. Exact body reconstruction precedes these reads.
export async function verifyImageBytes(url, expected, request = fetch) {
  let reader;
  try {
    const response = await request(url, { redirect: 'error', credentials: 'omit', signal: AbortSignal.timeout(5000) });
    reader = response.body?.getReader();
    if (response.status !== 200 || !reader) return false;
    const hash = createHash('sha256'); let size = 0;
    for (;;) {
      const { done, value } = await reader.read(); if (done) break;
      size += value.byteLength; if (size > expected.length || size > 5 * 1024 * 1024) return false;
      hash.update(value);
    }
    return size === expected.length && hash.digest('hex') === createHash('sha256').update(expected).digest('hex');
  } catch { return false; }
  finally { if (reader) await reader.cancel().catch(() => {}); }
}
