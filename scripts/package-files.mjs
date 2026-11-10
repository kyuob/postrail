export const userGuideFiles = Object.freeze(
  [
    "blogger",
    "faq",
    "images",
    "installation",
    "keyflow",
    "login",
    "npm-publication",
    "offline-cli",
    "publish",
    "recovery",
    "release-0.1.0",
    "release-0.1.2",
    "support",
    "third-party-notices",
    "tistory",
    "velog",
  ].map((name) => `docs/${name}.md`),
);
export const allowedPackageFile = (name) =>
  typeof name === "string" &&
  (/^package\/(?:package\.json|LICENSE|README(?:\.ko)?\.md|CHANGELOG\.md|CONTRIBUTING\.md|SECURITY\.md|dist\/cli\.js|examples\/[A-Za-z0-9._-]+\.(?:md|json))$/.test(
    name,
  ) ||
    (name.startsWith("package/") && userGuideFiles.includes(name.slice("package/".length))));
