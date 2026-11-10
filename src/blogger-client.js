import { fail } from "./core.js";

export const API = "https://www.googleapis.com/blogger/v3";
export const TOKEN_URL = "https://oauth2.googleapis.com/token";
export const BLOGGER_SCOPE = "https://www.googleapis.com/auth/blogger";
export function accountName(value) {
  if (typeof value !== "string" || !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/.test(value))
    fail(
      "BLOGGER_ACCOUNT_REQUIRED",
      "Pass --account with a local account name (letters, digits, underscores or hyphens).",
    );
  return value;
}
export function numericId(value) {
  if (typeof value !== "string" || !/^[0-9]{1,30}$/.test(value))
    fail("BLOGGER_ID_REQUIRED", "Pass a numeric Blogger blog ID.");
  return value;
}
export async function googleJson(url, options = {}, fetchImpl = globalThis.fetch) {
  if (!(url === TOKEN_URL || url.startsWith(API + "/")))
    fail("BLOGGER_REQUEST_INVALID", "Unsupported Google destination.");
  let response;
  try {
    response = await fetchImpl(url, {
      ...options,
      redirect: "error",
      signal: AbortSignal.timeout(30000),
    });
  } catch {
    fail(
      "BLOGGER_NETWORK_FAILED",
      "Google did not return a complete response. Do not retry an unresolved write.",
    );
  }
  try {
    if (response.status === 401)
      fail(
        "BLOGGER_LOGIN_REQUIRED",
        "Google rejected the saved session. Resolve previous writes before logging in again.",
      );
    if (response.status === 403)
      fail(
        "BLOGGER_PERMISSION_DENIED",
        "Google denied the request. Check consent, Blogger API enablement and blog permissions.",
      );
    if (response.status === 412)
      fail("BLOGGER_REMOTE_CONFLICT", "The remote post changed before this request was applied.");
    if (!response.ok)
      fail(
        "BLOGGER_HTTP_FAILED",
        "Google returned an unsuccessful response. Server output was withheld.",
      );
    const chunks = [];
    let size = 0;
    const reader = response.body?.getReader();
    if (!reader) fail("BLOGGER_RESPONSE_INVALID", "Google returned an empty response.");
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > 8 * 1024 * 1024)
          fail("BLOGGER_RESPONSE_INVALID", "Google returned an oversized response.");
        chunks.push(value);
      }
    } finally {
      await reader.cancel().catch(() => {});
      reader.releaseLock();
    }
    let result;
    try {
      result = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    } catch {
      fail("BLOGGER_RESPONSE_INVALID", "Google returned an unrecognized response.");
    }
    if (!result || typeof result !== "object" || Array.isArray(result) || result.error)
      fail("BLOGGER_RESPONSE_INVALID", "Google did not confirm the operation.");
    return result;
  } catch (e) {
    if (e.code?.startsWith("BLOGGER_")) throw e;
    fail(
      "BLOGGER_NETWORK_FAILED",
      "Google did not return a complete response. Inspect the result before retrying.",
    );
  } finally {
    await response.body?.cancel().catch(() => {});
  }
}
export class BloggerClient {
  constructor(token, fetchImpl = globalThis.fetch) {
    this.token = token;
    this.fetchImpl = fetchImpl;
  }
  async send(route, method = "GET", data, etag) {
    if (
      !/^\/(?:users\/self(?:\/blogs(?:\/[0-9]{1,30})?)?|blogs\/[0-9]{1,30}\/posts(?:\/[0-9]{1,30}(?:\/(?:publish|revert))?)?)(?:\?[A-Za-z0-9_=&%-]+)?$/.test(
        route,
      )
    )
      fail("BLOGGER_REQUEST_INVALID", "Unsupported Blogger route.");
    return googleJson(
      API + route,
      {
        method,
        headers: {
          Authorization: `Bearer ${this.token}`,
          Accept: "application/json",
          ...(data ? { "Content-Type": "application/json" } : {}),
          ...(etag ? { "If-Match": etag } : {}),
        },
        ...(data ? { body: JSON.stringify(data) } : {}),
      },
      this.fetchImpl,
    );
  }
  async user() {
    const user = await this.send("/users/self");
    if (
      user.kind !== "blogger#user" ||
      typeof user.id !== "string" ||
      !/^[0-9]{1,30}$/.test(user.id)
    )
      fail("BLOGGER_RESPONSE_INVALID", "Google did not confirm a Blogger user ID.");
    return { id: user.id };
  }
  async blogs() {
    const result = await this.send("/users/self/blogs?role=ADMIN&fetchUserInfo=true&status=LIVE");
    if (
      (result.items !== undefined && !Array.isArray(result.items)) ||
      (result.blogUserInfos !== undefined && !Array.isArray(result.blogUserInfos))
    )
      fail("BLOGGER_RESPONSE_INVALID", "Google returned an unsupported blog list.");
    const blogs =
      result.blogUserInfos !== undefined
        ? result.blogUserInfos.map((info) => {
            if (!info || typeof info !== "object" || !info.blog)
              fail("BLOGGER_RESPONSE_INVALID", "Google returned an unsupported blog membership.");
            if (
              info.blog_user_info?.role !== "ADMIN" ||
              info.blog_user_info.blogId !== info.blog?.id
            )
              fail(
                "BLOGGER_BLOG_MISMATCH",
                "Google did not confirm ADMIN membership for a listed blog.",
              );
            return info.blog;
          })
        : (result.items ?? []);
    return blogs.map((blog) => {
      if (
        typeof blog?.id !== "string" ||
        !/^[0-9]{1,30}$/.test(blog.id) ||
        typeof blog.name !== "string"
      )
        fail("BLOGGER_RESPONSE_INVALID", "Google returned an unsupported blog identity.");
      return { blogId: blog.id, name: blog.name };
    });
  }
  async target(blogId, userId) {
    numericId(blogId);
    const result = await this.send(`/users/self/blogs/${blogId}`);
    const info = result.blog_user_info;
    if (
      result.blog?.id !== blogId ||
      info?.blogId !== blogId ||
      info.userId !== userId ||
      info.role !== "ADMIN" ||
      info.hasAdminAccess !== true
    )
      fail(
        "BLOGGER_BLOG_MISMATCH",
        "The account does not have confirmed ADMIN access to the requested blog.",
      );
  }
  async read(blogId, postId) {
    numericId(blogId);
    numericId(postId);
    return this.send(`/blogs/${blogId}/posts/${postId}?view=ADMIN&fetchBody=true`);
  }
  async insert(blogId, data) {
    numericId(blogId);
    return this.send(`/blogs/${blogId}/posts?isDraft=true&fetchBody=true`, "POST", data);
  }
  async patch(blogId, postId, data, etag) {
    numericId(blogId);
    numericId(postId);
    return this.send(`/blogs/${blogId}/posts/${postId}?fetchBody=true`, "PATCH", data, etag);
  }
  async transition(blogId, postId, publish, etag) {
    numericId(blogId);
    numericId(postId);
    return this.send(
      `/blogs/${blogId}/posts/${postId}/${publish ? "publish" : "revert"}`,
      "POST",
      undefined,
      etag,
    );
  }
}
