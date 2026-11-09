import { homedir } from "node:os";
import { realpathSync, existsSync } from "node:fs";
import path from "node:path";
import { fail } from "./core.js";
import { digest, privateDirectory } from "./velog-journal.js";

export const VELOG_GRAPHQL = "https://v3.velog.io/graphql";
export const VELOG_UPLOAD = "https://v3.velog.io/api/files/v3/upload";
export const POST_FIELDS = "id title body tags is_temp is_private url_slug thumbnail short_description series { id } user { id username }";
export const READ_POST = `query PostrailRead($input: ReadPostInput!) { post(input: $input) { ${POST_FIELDS} } }`;
export const WRITE_POST = `mutation PostrailWrite($input: WritePostInput!) { writePost(input: $input) { ${POST_FIELDS} } }`;
export const EDIT_POST = `mutation PostrailEdit($input: EditPostInput!) { editPost(input: $input) { ${POST_FIELDS} } }`;
export function velogAccount(value) {
  if (typeof value !== "string" || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(value)) fail("VELOG_ACCOUNT_REQUIRED", "Pass --account with your exact Velog username (letters, digits, underscores or hyphens).");
  return value;
}
function profilePath(account, create) {
  let directory = realpathSync(homedir());
  for (const name of [".postrail", "velog-profiles", digest(account)]) {
    if (create) directory = privateDirectory(directory, name);
    else {
      const next = path.join(directory, name);
      if (!existsSync(next)) fail("VELOG_LOGIN_REQUIRED", "Run postrail velog login --account USERNAME first.");
      directory = privateDirectory(directory, name);
    }
  }
  return directory;
}
export class VelogClient {
  constructor(request) { this.request = request; }
  async send(endpoint, options) {
    let response;
    try { response = await this.request.post(endpoint, { ...options, headers: { Origin: "https://velog.io", Referer: "https://velog.io/" }, maxRedirects: 0, maxRetries: 0, timeout: 30_000 }); }
    catch { fail("VELOG_NETWORK_FAILED", "Velog did not return a complete response. Do not retry an unresolved write."); }
    try {
      if ([401, 403].includes(response.status())) fail("VELOG_LOGIN_REQUIRED", "Velog rejected this session; log in again before retrying a resolved operation.");
      if (response.status() < 200 || response.status() >= 300) fail("VELOG_HTTP_FAILED", "Velog returned an unsuccessful response. Server output was withheld.");
      const buffer = await response.body();
      if (buffer.length > 8 * 1024 * 1024) fail("VELOG_RESPONSE_INVALID", "Velog returned an oversized response.");
      let value;
      try { value = JSON.parse(buffer.toString("utf8")); } catch { fail("VELOG_RESPONSE_INVALID", "Velog returned an unrecognized response."); }
      if (!value || typeof value !== "object" || Array.isArray(value)) fail("VELOG_RESPONSE_INVALID", "Velog returned an unrecognized response.");
      return value;
    } finally { await response.dispose().catch(() => {}); }
  }
  async graphql(query, variables = {}) {
    const operationName = /(?:query|mutation)\s+(\w+)/.exec(query)[1];
    const value = await this.send(VELOG_GRAPHQL, { data: { operationName, query, variables } });
    if (value.errors?.length || !value.data || typeof value.data !== "object") fail("VELOG_GRAPHQL_FAILED", "Velog did not confirm the operation. Server errors were withheld; no alternate schema was tried.");
    return value.data;
  }
  async currentUser() {
    const { currentUser } = await this.graphql("query PostrailAccount { currentUser { id username } }");
    return currentUser;
  }
  async read(id) { return (await this.graphql(READ_POST, { input: { id } })).post; }
  async write(input, update) { return (await this.graphql(update ? EDIT_POST : WRITE_POST, { input }))[update ? "editPost" : "writePost"]; }
  async upload(image, name) {
    const result = await this.send(VELOG_UPLOAD, { multipart: { image: { name, mimeType: image.mime, buffer: image.data }, type: "post" } });
    let url;
    try { url = new URL(result.path); } catch { fail("VELOG_RESPONSE_INVALID", "Velog did not return an image URL."); }
    if (url.protocol !== "https:" || !(url.hostname === "velcdn.com" || url.hostname.endsWith(".velcdn.com")) || url.username || url.password) fail("VELOG_RESPONSE_INVALID", "Velog returned an unexpected image destination.");
    return url.href;
  }
}
export async function withVelogSession(account, action, { login = false } = {}) {
  velogAccount(account);
  const directory = profilePath(account, login);
  let context;
  try {
    // Keep Playwright external to the Bun bundle; it locates its runtime assets itself.
    const { chromium } = await import("playwright-core");
    context = await chromium.launchPersistentContext(directory, { channel: "chrome", headless: !login, timeout: 30_000, acceptDownloads: false });
  } catch { fail("VELOG_BROWSER_FAILED", "Cannot open the dedicated Postrail Chrome profile. Install Google Chrome and close another Postrail session using this account."); }
  try {
    const client = new VelogClient(context.request);
    if (login) {
      const page = await context.newPage();
      await page.goto("https://velog.io/", { timeout: 30_000 });
      const deadline = Date.now() + 180_000;
      while (Date.now() < deadline) {
        const user = await client.currentUser();
        if (user) {
          if (user.username !== account || typeof user.id !== "string" || !user.id) fail("VELOG_ACCOUNT_MISMATCH", "This browser is signed into a different Velog username. Use the requested account in the dedicated profile.");
          return await action(client, user);
        }
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
      fail("VELOG_LOGIN_TIMEOUT", "Velog login timed out. No post was sent.");
    }
    const user = await client.currentUser();
    if (!user) fail("VELOG_LOGIN_REQUIRED", "Sign in using postrail velog login first.");
    if (user.username !== account || typeof user.id !== "string" || !user.id) fail("VELOG_ACCOUNT_MISMATCH", "The saved profile does not match the requested Velog account.");
    return await action(client, user);
  } catch (error) {
    if (error.code?.startsWith("VELOG_")) throw error;
    fail("VELOG_SESSION_FAILED", "The Velog session ended unexpectedly. Inspect local and remote state before retrying.");
  } finally {
    try { await context.close(); }
    catch { fail("VELOG_CLEANUP_FAILED", "Chrome profile cleanup failed. Inspect the operation result before retrying."); }
  }
}
