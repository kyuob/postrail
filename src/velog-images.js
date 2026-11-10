import { fromMarkdown } from "mdast-util-from-markdown";
import { fail } from "./core.js";

export function velogImages(article) {
  const tree = fromMarkdown(article.body);
  const definitions = new Map();
  const references = [];
  const expected = new Map();
  function walk(node, visit) {
    visit(node);
    for (const child of node.children ?? []) walk(child, visit);
  }
  walk(tree, (node) => {
    if (node.type === "definition" && !definitions.has(node.identifier))
      definitions.set(node.identifier, node);
  });
  walk(tree, (node) => {
    if (!["image", "imageReference"].includes(node.type)) return;
    const definition = node.type === "imageReference" ? definitions.get(node.identifier) : node;
    if (!definition) fail("VELOG_IMAGE_SYNTAX", "An image reference could not be resolved.");
    const source = article.md.normalizeLink(definition.url);
    if (!article.images.has(source))
      fail(
        "VELOG_IMAGE_SYNTAX",
        "Markdown parsers disagree about an image; rewrite that image before uploading.",
      );
    expected.set(source, (expected.get(source) ?? 0) + 1);
    if (article.images.get(source).kind === "local")
      references.push({
        source,
        start: node.position.start.offset,
        end: node.position.end.offset,
        alt: node.alt ?? "",
        title: definition.title,
      });
  });
  const actual = new Map();
  function inspect(tokens) {
    for (const token of tokens) {
      if (token.type === "image") {
        const src = token.attrGet("src");
        actual.set(src, (actual.get(src) ?? 0) + 1);
      }
      if (token.children) inspect(token.children);
    }
  }
  inspect(article.tokens);
  if (
    actual.size !== expected.size ||
    [...actual].some(([src, count]) => expected.get(src) !== count)
  )
    fail(
      "VELOG_IMAGE_SYNTAX",
      "Markdown parsers disagree about these images. Rewrite them before uploading.",
    );
  return references;
}
export function replaceVelogImages(article, references, urls) {
  let body = article.body;
  for (const ref of [...references].sort((a, b) => b.start - a.start)) {
    const url = urls.get(ref.source);
    if (!url) fail("VELOG_IMAGE_FAILED", "A local image upload was not confirmed.");
    const alt = ref.alt.replace(/[\\\[\]]/g, "\\$&");
    const title = ref.title
      ? ` "${ref.title.replace(/[\\"]/g, "\\$&").replace(/[\r\n]/g, " ")}"`
      : "";
    body = body.slice(0, ref.start) + `![${alt}](<${url}>${title})` + body.slice(ref.end);
  }
  return body;
}
