import { homedir } from 'node:os';
import { fail } from './core.js';
import { directories, hash } from './tistory-storage.js';
import { editorConfig, verifyBlog, postFromConfig } from './tistory-format.js';
import { manualChromeLogin } from './manual-chrome-login.js';

export function tistoryTarget(blog, blogId) {
  if (typeof blog !== 'string' || !/^[a-z0-9][a-z0-9-]{0,61}[a-z0-9]$/.test(blog) || ['www', 'notice', 'tistory'].includes(blog)) fail('TISTORY_BLOG_REQUIRED', 'Pass --blog with the exact Tistory subdomain name (not a URL).');
  if (typeof blogId !== 'string' || !/^[1-9][0-9]{0,15}$/.test(blogId)) fail('TISTORY_BLOG_ID_REQUIRED', 'Pass --blog-id with the numeric blog ID shown in the editor configuration.');
  return { blog, blogId, host: `${blog}.tistory.com`, origin: `https://${blog}.tistory.com` };
}
export class TistoryClient {
  constructor(request, target) { this.request = request; this.target = target; }
  async send(route, method = 'GET', options = {}, json = true) {
    if (!/^\/manage\/(?:newpost(?:\/[1-9][0-9]{0,15})?|post\.json|post\/[1-9][0-9]{0,15}\.json|post\/attach\.json)$/.test(route)) fail('TISTORY_REQUEST_INVALID', 'Unsupported internal route.');
    let response;
    try { response = await this.request.fetch(this.target.origin + route, { ...options, method, maxRedirects: 0, maxRetries: 0, timeout: 30000,
      headers: { Origin: this.target.origin, Referer: this.target.origin + '/manage/newpost', Accept: json ? 'application/json' : 'text/html', 'X-Requested-With': 'XMLHttpRequest' } }); }
    catch { fail('TISTORY_NETWORK_FAILED', 'Tistory did not return a complete response. Do not retry an unresolved write.'); }
    try {
      const status = response.status();
      if ([301, 302, 303, 307, 308, 401, 403].includes(status)) fail('TISTORY_LOGIN_REQUIRED', 'Tistory requires login or an interactive verification. No redirects were followed.');
      if (status < 200 || status >= 300) fail('TISTORY_HTTP_FAILED', 'Tistory returned an unsuccessful response. Server output was withheld.');
      const buffer = await response.body();
      if (buffer.length > 8 * 1024 * 1024) fail('TISTORY_RESPONSE_INVALID', 'Tistory returned an oversized response.');
      const text = buffer.toString('utf8');
      if (!json) return text;
      let value; try { value = JSON.parse(text); } catch { fail('TISTORY_RESPONSE_INVALID', 'Tistory returned an unsupported response, possibly a login or verification page.'); }
      if (!value || typeof value !== 'object' || Array.isArray(value)) fail('TISTORY_RESPONSE_INVALID', 'Tistory did not confirm the operation.');
      return value;
    } finally { await response.dispose().catch(() => {}); }
  }
  async identity() { const config = editorConfig(await this.send('/manage/newpost', 'GET', {}, false)); verifyBlog(config, this.target); return this.target; }
  async read(id) { return postFromConfig(editorConfig(await this.send(`/manage/newpost/${id}`, 'GET', {}, false)), this.target, id); }
  async upload(image, name) { return this.send('/manage/post/attach.json', 'POST', { multipart: { file: { name, mimeType: image.mime, buffer: image.data } } }); }
  async write(input, id) {
    const value = await this.send(id ? `/manage/post/${id}.json` : '/manage/post.json', id ? 'PUT' : 'POST', { data: input });
    let url; try { url = new URL(value.entryUrl, this.target.origin); } catch { fail('TISTORY_RESPONSE_INVALID', 'No supported post URL was returned.'); }
    if (url.origin !== this.target.origin || !/^\/[1-9][0-9]{0,15}\/?$/.test(url.pathname) || url.search || url.hash || url.username || url.password) fail('TISTORY_RESPONSE_INVALID', 'Tistory returned an unexpected post destination.');
    const postId = url.pathname.replaceAll('/', '');
    if (id && postId !== id) fail('TISTORY_RESPONSE_INVALID', 'Tistory returned a different saved post ID.');
    return { postId, url: `${this.target.origin}/${postId}` };
  }
}
export async function withTistorySession(target, action, { login = false } = {}) {
  const directory = directories(homedir(), ['.postrail', 'tistory-profiles', hash([target.blog, target.blogId])], login);
  if (!directory) fail('TISTORY_LOGIN_REQUIRED', 'Run tistory login for the requested blog and blog ID first.');
  if (login) {
    console.error('일반 Chrome의 Postrail 전용 프로필에서 티스토리에 로그인한 뒤, 해당 Chrome 앱을 ⌘Q로 종료해 주세요. 종료 후 블로그를 확인합니다.');
    await manualChromeLogin(directory, { service: 'tistory', destination: target.origin + '/manage' });
  }
  let context;
  try { const { chromium } = await import('playwright-core'); context = await chromium.launchPersistentContext(directory, { channel: 'chrome', chromiumSandbox: true, headless: true, timeout: 30000, acceptDownloads: false, args: ['--restore-last-session'], ignoreDefaultArgs: ['--use-mock-keychain', '--password-store=basic'] }); }
  catch { fail('TISTORY_BROWSER_FAILED', 'Cannot open the dedicated Postrail Chrome profile. Install Chrome and close another session for this blog.'); }
  try {
    const client = new TistoryClient(context.request, target);
    await client.identity(); return await action(client, target);
  } catch (e) { if (e.code?.startsWith('TISTORY_')) throw e; fail('TISTORY_SESSION_FAILED', 'The session ended unexpectedly. Inspect local and remote state before retrying.'); }
  finally { try { await context.close(); } catch { fail('TISTORY_CLEANUP_FAILED', 'Chrome cleanup failed. Inspect the operation result before retrying.'); } }
}
