// Exercise the documented beginner flow only: no install, login or live adapter checks.
import assert from "node:assert/strict";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
  readdirSync,
  existsSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = fileURLToPath(new URL("../", import.meta.url));
const cli = path.join(root, "dist/cli.js");
assert(existsSync(cli), "Build the CLI before running onboarding smoke.");
const doc = readFileSync(path.join(root, "docs/installation.md"), "utf8");
function block(name, language) {
  const marker = `<!-- onboarding:${name} -->\n\x60\x60\x60${language}\n`;
  assert.equal(doc.split(marker).length, 2, `Expected one documented ${name} block.`);
  const text = doc.split(marker)[1].split("\n```")[0];
  assert(text.trim());
  return text + "\n";
}
const article = block("article", "markdown");
const destinations = block("destinations", "json");
const lines = block("commands", "sh").trim().split("\n");
const commands = lines.map((line) => {
  const words = line.trim().split(/\s+/);
  assert.equal(words.shift(), "postrail");
  return words;
});
assert.deepEqual(
  commands.map((args) => args[0]),
  ["--version", "init", "validate", "preview", "publish"],
);
assert(commands.at(-1).includes("--dry-run"));
assert(
  !commands.some(
    (args) => args.includes("--confirm") || args.includes("login") || args.includes("keyflow"),
  ),
);
assert.deepEqual(Object.keys(JSON.parse(destinations).destinations).sort(), ["blogger", "velog"]);

const base = path.join(root, ".postrail/docs-v011");
mkdirSync(base, { recursive: true, mode: 0o700 });
const work = mkdtempSync(path.join(base, "onboarding-"));
// A preload makes unintended network/session launch regressions fail locally.
const guard = path.join(work, "offline-guard.cjs");
writeFileSync(
  guard,
  `
const deny = () => { throw new Error('Onboarding must remain offline and cannot launch subprocesses.'); };
globalThis.fetch = deny;
for (const [name, methods] of Object.entries({
  'node:http': ['request', 'get'], 'node:https': ['request', 'get'],
  'node:net': ['connect', 'createConnection'], 'node:tls': ['connect'],
  'node:dns': ['lookup', 'resolve'],
  'node:child_process': ['spawn', 'spawnSync', 'exec', 'execSync', 'execFile', 'execFileSync', 'fork']
})) for (const method of methods) require(name)[method] = deny;
require('node:net').Socket.prototype.connect = deny;
require('node:module').syncBuiltinESMExports();
`,
  { mode: 0o600 },
);

const modes = process.platform === "win32" ? ["source"] : ["source", "executable"];
for (const mode of modes) {
  const cwd = path.join(work, mode),
    home = path.join(work, `${mode}-home`);
  mkdirSync(cwd);
  mkdirSync(home, { mode: 0o700 });
  // This is the editor-save step described before the command block.
  writeFileSync(path.join(cwd, "article.md"), article, { flag: "wx" });
  writeFileSync(path.join(cwd, "my-destinations.json"), destinations, { flag: "wx" });
  const env = {
    ...process.env,
    HOME: home,
    USERPROFILE: home,
    XDG_CONFIG_HOME: home,
    XDG_DATA_HOME: home,
    NODE_OPTIONS: `--require=${JSON.stringify(guard)}`,
  };
  for (const args of commands) {
    // Both entries use the same absolute built CLI. Actual consumer/global installation
    // remains package-smoke/release testing; this script does not install anything.
    const result =
      mode === "source"
        ? spawnSync(process.execPath, [cli, ...args], {
            cwd,
            env,
            encoding: "utf8",
            timeout: 10000,
          })
        : spawnSync(cli, args, { cwd, env, encoding: "utf8", timeout: 10000 });
    assert.ifError(result.error);
    assert.equal(
      result.status,
      0,
      `Documented ${mode} command ${args[0]} failed; output withheld.`,
    );
    if (args[0] === "--version") assert.match(result.stdout.trim(), /^\d+\.\d+\.\d+(?:[-+].*)?$/);
    if (args.includes("--json")) {
      const value = JSON.parse(result.stdout);
      assert.equal(value.ok, true);
      if (args[0] === "publish") {
        assert.equal(value.offline, true);
        assert.equal(value.dryRun, true);
        assert.deepEqual(value.results, []);
      }
    }
  }
  assert.equal(readFileSync(path.join(cwd, "article.md"), "utf8"), article);
  assert.equal(readFileSync(path.join(cwd, "my-destinations.json"), "utf8"), destinations);
  assert.match(readFileSync(path.join(cwd, "preview.html"), "utf8"), /첫 초안/);
  assert.deepEqual(readdirSync(cwd).sort(), [
    "article.md",
    "my-destinations.json",
    "postrail.json",
    "preview.html",
  ]);
  assert.deepEqual(readdirSync(home), [], "Offline onboarding must not create home/session files.");
}
console.log(
  `PASS onboarding: documented article, destinations and five commands in empty consumers (${modes.join(", ")}); network/subprocesses blocked, sources preserved, no journals or session files. No installation or authentication tested.`,
);
