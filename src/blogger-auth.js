import { homedir } from 'node:os';
import path from 'node:path';
import { createServer } from 'node:http';
import { randomBytes, createHash, timingSafeEqual } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fail } from './core.js';
import { storage, digest, readPrivate, savePrivate, locked } from './blogger-storage.js';
import { BloggerClient, accountName, googleJson, TOKEN_URL, BLOGGER_SCOPE } from './blogger-client.js';

const execute = promisify(execFile);
const validSecret = v => typeof v === 'string' && v.length > 0 && v.length <= 8192 && !/[\s\x00-\x1f\x7f]/.test(v);
function validateClient(client) {
  if (!client || typeof client.client_id !== 'string' || !/^[A-Za-z0-9_-]+\.apps\.googleusercontent\.com$/.test(client.client_id)
    || client.client_secret !== undefined && !validSecret(client.client_secret)) fail('BLOGGER_CLIENT_INVALID', 'Use a valid installed Desktop OAuth client JSON file.');
  return { client_id: client.client_id, ...(client.client_secret ? { client_secret: client.client_secret } : {}) };
}
export function credentialsPath(account, home, create = false) {
  if (process.platform === 'win32') fail('BLOGGER_PLATFORM_UNSUPPORTED', 'Blogger credential storage requires POSIX file permissions. Windows authentication is not supported yet.');
  accountName(account); const dir = storage(home, ['.postrail', 'blogger-accounts', digest(account)], create);
  return dir && path.join(dir, 'credentials.json');
}
function validateCredentials(value, account) {
  if (!value || value.version !== 1 || value.account !== account || typeof value.userId !== 'string' || !/^[0-9]{1,30}$/.test(value.userId)
    || !validSecret(value.refreshToken) || !validSecret(value.accessToken) || !Number.isSafeInteger(value.expiresAt)) fail('BLOGGER_LOGIN_REQUIRED', 'Saved Blogger credentials are missing or invalid. Log in explicitly.');
  validateClient(value.client); return value;
}
function tokenResult(value) {
  if (!validSecret(value.access_token) || value.token_type?.toLowerCase() !== 'bearer' || !Number.isInteger(value.expires_in) || value.expires_in < 1 || value.expires_in > 604800
    || value.scope !== undefined && (typeof value.scope !== 'string' || !value.scope.split(' ').includes(BLOGGER_SCOPE))
    || value.refresh_token !== undefined && !validSecret(value.refresh_token)) fail('BLOGGER_OAUTH_FAILED', 'Google did not return the required Blogger token grant.');
  return { accessToken: value.access_token, expiresAt: Date.now() + value.expires_in * 1000, ...(value.refresh_token ? { refreshToken: value.refresh_token } : {}) };
}
export function pkce() {
  const verifier = randomBytes(32).toString('base64url');
  return { verifier, challenge: createHash('sha256').update(verifier).digest('base64url'), state: randomBytes(32).toString('base64url') };
}
export async function callbackReceiver(state, timeout = 180000) {
  let resolve, reject, settled = false, timer;
  const wait = new Promise((yes, no) => { resolve = yes; reject = no; });
  wait.catch(() => {}); // Opening a browser may fail before the caller starts waiting.
  const server = createServer((req, res) => {
    res.setHeader('Cache-Control', 'no-store'); res.setHeader('Referrer-Policy', 'no-referrer'); res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    const host = `127.0.0.1:${server.address().port}`;
    let url; try { url = new URL(req.url, `http://${host}`); } catch { res.writeHead(400).end('Invalid callback.'); return; }
    const supplied = url.searchParams.get('state') ?? '';
    const suppliedBytes = Buffer.from(supplied), expectedBytes = Buffer.from(state);
    const matches = suppliedBytes.length === expectedBytes.length && timingSafeEqual(suppliedBytes, expectedBytes);
    if (settled || req.method !== 'GET' || req.headers.host !== host || req.socket.remoteAddress !== '127.0.0.1' || url.origin !== `http://${host}`
      || url.pathname !== '/oauth/callback' || url.searchParams.getAll('state').length !== 1 || !matches) { res.writeHead(400).end('Invalid callback.'); return; }
    if (url.searchParams.has('error')) { settled = true; clearTimeout(timer); res.end('Authorization was not completed. Return to Postrail.'); reject(Object.assign(new Error('Authorization declined.'), { code: 'BLOGGER_OAUTH_DENIED' })); return; }
    const code = url.searchParams.get('code');
    if (url.searchParams.getAll('code').length !== 1 || !validSecret(code)) { res.writeHead(400).end('Invalid callback.'); return; }
    settled = true; clearTimeout(timer); res.end('Authorization received. Close this tab and return to Postrail.'); resolve(code);
  });
  server.requestTimeout = 5000; server.headersTimeout = 5000; server.maxHeadersCount = 30;
  try { await new Promise((yes, no) => { server.once('error', no); server.listen(0, '127.0.0.1', yes); }); }
  catch { fail('BLOGGER_CALLBACK_FAILED', 'Cannot open a local loopback OAuth callback.'); }
  timer = setTimeout(() => { settled = true; reject(Object.assign(new Error('OAuth timed out.'), { code: 'BLOGGER_OAUTH_TIMEOUT' })); }, timeout);
  const redirectUri = `http://127.0.0.1:${server.address().port}/oauth/callback`;
  return { redirectUri, wait, close: async () => { clearTimeout(timer); await new Promise(resolveClose => { server.close(resolveClose); server.closeAllConnections(); }); } };
}
async function systemBrowser(url) {
  try {
    if (process.platform === 'darwin') await execute('open', [url]);
    else if (process.platform === 'win32') await execute('rundll32.exe', ['url.dll,FileProtocolHandler', url]);
    else await execute('xdg-open', [url]);
  } catch { fail('BLOGGER_BROWSER_FAILED', 'Cannot open the system browser for Google consent. No token or authorization URL was printed.'); }
}
export async function loginAccount(account, clientFile, { home = homedir(), fetchImpl = globalThis.fetch, openBrowser = systemBrowser, timeout } = {}) {
  accountName(account);
  const config = readPrivate(clientFile);
  const client = validateClient(config?.installed);
  const file = credentialsPath(account, home, true);
  return locked(file, async () => {
    const old = readPrivate(file);
    if (old) validateCredentials(old, account);
    const proof = pkce(); const receiver = await callbackReceiver(proof.state, timeout);
    try {
      const auth = new URL('https://accounts.google.com/o/oauth2/v2/auth');
      auth.search = new URLSearchParams({ client_id: client.client_id, redirect_uri: receiver.redirectUri, response_type: 'code', scope: BLOGGER_SCOPE,
        access_type: 'offline', prompt: 'select_account consent', code_challenge_method: 'S256', code_challenge: proof.challenge, state: proof.state }).toString();
      await openBrowser(auth.href);
      const code = await receiver.wait;
      const grant = tokenResult(await googleJson(TOKEN_URL, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ ...client, code, code_verifier: proof.verifier, redirect_uri: receiver.redirectUri, grant_type: 'authorization_code' }).toString() }, fetchImpl));
      if (!grant.refreshToken) fail('BLOGGER_OAUTH_FAILED', 'Google did not return offline access. Explicitly consent again before using this account.');
      const api = new BloggerClient(grant.accessToken, fetchImpl); const user = await api.user();
      if (old && old.userId !== user.id) fail('BLOGGER_ACCOUNT_MISMATCH', 'This account name is already bound to another Blogger user. Use the original account or a new local name.');
      savePrivate(file, { version: 1, account, userId: user.id, client, ...grant });
      return { ok: true, command: 'blogger login', account, liveVerified: false };
    } catch (e) {
      if (e.code?.startsWith('BLOGGER_')) {
        if (e.code === 'BLOGGER_OAUTH_DENIED') fail(e.code, 'Google consent was declined. No post was sent.');
        if (e.code === 'BLOGGER_OAUTH_TIMEOUT') fail(e.code, 'Google consent timed out. No post was sent.');
        throw e;
      }
      fail('BLOGGER_OAUTH_FAILED', 'Google authorization did not complete. Response details were withheld.');
    } finally { await receiver.close(); }
  });
}
export async function withBloggerSession(account, action, { home = homedir(), fetchImpl = globalThis.fetch } = {}) {
  accountName(account); const file = credentialsPath(account, home);
  if (!file) fail('BLOGGER_LOGIN_REQUIRED', 'Run blogger login for this local account first.');
  return locked(file, async () => {
    let saved = validateCredentials(readPrivate(file), account);
    if (saved.expiresAt < Date.now() + 60000) {
      const grant = tokenResult(await googleJson(TOKEN_URL, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ ...saved.client, refresh_token: saved.refreshToken, grant_type: 'refresh_token' }).toString() }, fetchImpl));
      saved = { ...saved, ...grant }; savePrivate(file, saved);
    }
    const api = new BloggerClient(saved.accessToken, fetchImpl); const user = await api.user();
    if (user.id !== saved.userId) fail('BLOGGER_ACCOUNT_MISMATCH', 'The saved session no longer matches this Blogger account.');
    return action(api, user);
  });
}
