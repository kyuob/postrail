import assert from 'node:assert/strict';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import MarkdownIt from 'markdown-it';
import { parseDocument } from 'yaml';

const root = fileURLToPath(new URL('../', import.meta.url));
const files = ['README.md', 'README.ko.md', 'CONTRIBUTING.md', 'SECURITY.md', 'CHANGELOG.md', ...readdirSync(path.join(root, 'docs')).filter(n => n.endsWith('.md')).map(n => 'docs/' + n)];
const md = new MarkdownIt(); let links = 0;
for (const file of files) {
  const text = readFileSync(path.join(root, file), 'utf8'); assert(text.trim(), `Empty document: ${file}`);
  assert.equal((text.match(/^```/gm) ?? []).length % 2, 0, `Unclosed code fence: ${file}`);
  for (const block of md.parse(text, {})) for (const token of block.children ?? []) {
    const href = token.type === 'link_open' ? token.attrGet('href') : token.type === 'image' ? token.attrGet('src') : undefined;
    if (!href || /^(?:https?:|mailto:|#)/i.test(href)) continue;
    assert(!/^[a-z][a-z0-9+.-]*:/i.test(href), `Unsupported document link scheme: ${file}`);
    const target = path.resolve(root, path.dirname(file), decodeURIComponent(href.split('#')[0]));
    assert(target.startsWith(root), `Link escapes package: ${file}`);
    assert(existsSync(target), `Broken local link in ${file}: ${href}`); links++;
  }
}
const cli = path.join(root, 'dist/cli.js');
function run(args) {
  const result = spawnSync(process.execPath, [cli, ...args], { cwd: root, encoding: 'utf8', timeout: 10000 });
  assert.ifError(result.error); assert.equal(result.status, 0, `Documented offline command failed: ${args[0]}`); return JSON.parse(result.stdout);
}
for (const name of ['article', 'velog', 'tistory', 'blogger']) assert.equal(run(['validate', `examples/${name}.md`, '--json']).ok, true);
assert.equal(run(['publish', 'examples/blogger.md', '--to', 'velog,blogger', '--destinations', 'examples/destinations.json', '--dry-run', '--json']).offline, true);
const pkg = JSON.parse(readFileSync(path.join(root, 'package.json')));
assert.equal(pkg.private, true); // GitHub release only; registry publication is separate.
assert.equal(pkg.name, '@kyuob/postrail'); assert.equal(pkg.version, '0.1.2');
const workflowText = readFileSync(path.join(root, '.github/workflows/ci.yml'), 'utf8');
const workflow = parseDocument(workflowText).toJS();
assert.equal(workflow.permissions.contents, 'read');
assert.deepEqual(workflow.jobs['offline-matrix'].strategy.matrix.os, ['ubuntu-latest', 'macos-latest', 'windows-latest']);
assert.deepEqual(workflow.jobs['offline-matrix'].strategy.matrix.node, [22, 24]);
assert.deepEqual(workflow.jobs['package-and-docs'].strategy.matrix.node, [22, 24]);
assert(!workflowText.includes('secrets.'), 'Offline CI must not depend on account secrets.');
for (const job of Object.values(workflow.jobs)) for (const step of job.steps) if (step.uses) assert(/@[a-f0-9]{40}$/.test(step.uses), 'Actions must be pinned to reviewed commits.');
await import('./onboarding-smoke.mjs');
console.log(`PASS docs: ${files.length} nonempty documents, ${links} local links, example validation and documented offline publish. No login or remote write performed.`);
