#!/usr/bin/env node
import { readFileSync } from "node:fs";
import path from "node:path";
import { UserError, fail, initialize, loadConfig, loadArticle, targets, summary, preview, writeNew } from "./core.js";
import { keyflowCommand } from "./keyflow-command.js";
import { velogCommand } from "./velog-command.js";
import { tistoryCommand } from "./tistory-command.js";

const { version } = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8"),
);
const args = process.argv.slice(2);
const json = args.includes("--json");
const help = `Postrail — write once, publish across your blogs.

Usage:
  postrail init [--json]
  postrail validate <article.md> [--config <file>] [--json]
  postrail preview <article.md> [--output <new.html>] [--config <file>] [--json]
  postrail plan <article.md> [--to velog,tistory,keyflow,blogger] [--config <file>] [--json]
  postrail keyflow check <article.md> [--config <file>] [--json]
  postrail keyflow login --account <name>
  postrail keyflow status <article.md> --account <name> [--json]
  postrail keyflow push <article.md> --account <name> --confirm [--json]
  postrail velog check <article.md> [--config <file>] [--json]
  postrail velog login --account <username>
  postrail velog status <article.md> --account <username> [--json]
  postrail velog get <article.md> --account <username> [--json]
  postrail velog push <article.md> --account <username> --confirm [--json]
  postrail tistory check <article.md> [--json]
  postrail tistory login --blog <name> --blog-id <id>
  postrail tistory status <article.md> --blog <name> --blog-id <id> [--json]
  postrail tistory get <article.md> --blog <name> --blog-id <id> [--json]
  postrail tistory push <article.md> --blog <name> --blog-id <id> --confirm [--json]
  postrail --help
  postrail --version

init/validate/preview/plan and platform check/status are offline.
KeyFlow login opens a browser; keyflow push sends content after --confirm.
Preview prints HTML unless --output is given.
Existing files are never overwritten. --json returns structured results/errors.
Multi-platform publishing is not available yet. KeyFlow uses its official CLI.
Velog integration is experimental; live account validation is pending.
Tistory is experimental (private/public only); live validation is pending.
Blogger publishing is not implemented; use per-platform subcommands.`;

function parse() {
  if (!args.length || args.length === 1 && ["--help", "-h", "help"].includes(args[0])) return { command: "help" };
  if (args.length === 1 && ["--version", "-v"].includes(args[0])) return { command: "version" };
  const [command, ...rest] = args;
  if (!["init", "validate", "preview", "plan"].includes(command)) fail("UNSUPPORTED_COMMAND", "Unsupported command or arguments. Publishing is not implemented yet. Run postrail --help.");
  const allowed = command === "init" ? ["--json"] : ["--json", "--config", ...(command === "preview" ? ["--output"] : []), ...(command === "plan" ? ["--to"] : [])];
  const options = {};
  let file;
  for (let index = 0; index < rest.length; index++) {
    const argument = rest[index];
    if (argument.startsWith("-")) {
      if (!allowed.includes(argument) || Object.hasOwn(options, argument)) fail("INVALID_ARGUMENT", "Unknown or repeated option. Run postrail --help.");
      if (argument === "--json") options[argument] = true;
      else {
        const value = rest[++index];
        if (!value || value.startsWith("-")) fail("INVALID_ARGUMENT", "Option requires a value.");
        options[argument] = value;
      }
    } else if (file || command === "init") fail("INVALID_ARGUMENT", "Unexpected argument. Run postrail --help.");
    else file = argument;
  }
  if (command !== "init" && !file) fail("INVALID_ARGUMENT", "An article path is required.");
  return { command, file, options };
}

async function main() {
  if (args[0] === "tistory") {
    const result = await tistoryCommand(args.slice(1));
    if (json) console.log(JSON.stringify(result));
    else if (result.command === "tistory status") console.log(`Local Tistory state: ${result.state.status}`);
    else if (result.command === "tistory check") console.log(result.canPush ? "Tistory check: passed; live validation pending." : `Tistory check: ${result.blockers.join(", ")}`);
    else if (result.command === "tistory push") console.log(result.skipped ? `Unchanged; upload skipped (${result.postId}).` : `Tistory ${result.visibility}: ${result.postId}\n${result.url}`);
    else if (result.command === "tistory get") console.log(`Tistory ${result.visibility}: ${result.postId}; matches last saved: ${result.matchesLastSaved}`);
    else console.log(`${result.command}: complete.`);
    return;
  }
  if (args[0] === "velog") {
    const result = await velogCommand(args.slice(1));
    if (json) console.log(JSON.stringify(result));
    else if (result.command === "velog status") console.log(`Local Velog state: ${result.state.status}`);
    else if (result.command === "velog push") console.log(result.skipped ? `Unchanged; upload skipped (${result.postId}).` : `Velog ${result.visibility}: ${result.postId}\n${result.url}`);
    else if (result.command === "velog get") console.log(`Velog ${result.visibility}: ${result.postId}; matches last saved: ${result.matchesLastSaved}`);
    else console.log(`${result.command}: complete.`);
    return;
  }
  if (args[0] === "keyflow") {
    const result = keyflowCommand(args.slice(1));
    if (json) console.log(JSON.stringify(result));
    else if (result.command === "keyflow push") console.log(result.skipped ? `Unchanged; upload skipped (${result.postId}).` : `KeyFlow ${result.status} (${result.visibility}): ${result.postId}${result.url ? `\n${result.url}` : ""}`);
    else if (result.command === "keyflow status") console.log(`Local KeyFlow state: ${result.state.status}${result.state.postId ? ` (${result.state.postId})` : ""}`);
    else console.log(`${result.command}: complete.`);
    return;
  }
  const { command, file, options } = parse();
  if (command === "help") return console.log(help);
  if (command === "version") return console.log(version);
  let result;
  if (command === "init") {
    result = { ok: true, command, config: initialize(process.cwd()) };
  } else {
    const config = loadConfig(path.resolve(options["--config"] ?? "postrail.json"), !!options["--config"]);
    const to = options["--to"] === undefined ? undefined : targets(options["--to"].split(","), "INVALID_ARGUMENT");
    const article = loadArticle(path.resolve(file), config, to);
    result = { ok: true, command, offline: true, article: summary(article) };
    if (command === "preview") {
      const html = preview(article);
      if (options["--output"]) {
        result.output = path.resolve(options["--output"]);
        writeNew(result.output, html);
      } else if (json) result.html = html;
      else return process.stdout.write(html);
    }
    if (command === "plan") {
      result.ready = false;
      result.targets = article.meta.targets.map(platform => ({ platform, visibility: article.meta.visibility, status: platform === "keyflow" ? "implemented" : "unverified", canPublish: false, blockers: platform === "keyflow" ? ["USE_KEYFLOW_SUBCOMMAND"] : platform === "velog" ? ["LIVE_NOT_VERIFIED", "USE_VELOG_SUBCOMMAND"] : platform === "tistory" ? ["LIVE_NOT_VERIFIED", "USE_TISTORY_SUBCOMMAND", ...(article.meta.visibility === "draft" ? ["TISTORY_DRAFT_UNSUPPORTED"] : [])] : ["ADAPTER_NOT_IMPLEMENTED"] }));
    }
  }
  if (json) console.log(JSON.stringify(result));
  else if (command === "init") console.log(`Created ${result.config}`);
  else {
    console.log(`${command === "validate" ? "Valid" : command === "preview" ? "Preview saved" : "Offline plan"}: ${result.article.title}`);
    if (result.output) console.log(result.output);
    if (result.targets) for (const target of result.targets) console.log(target.platform === "keyflow"
      ? `  keyflow: ${target.visibility}, implemented — use postrail keyflow push`
      : `  ${target.platform}: ${target.visibility}, unverified — publishing unavailable`);
    for (const warning of result.article.warnings) console.log(`Warning: ${warning}`);
  }
}

try { await main(); }
catch (error) {
  const code = error instanceof UserError ? error.code : "INTERNAL_ERROR";
  const message = error instanceof UserError ? error.message : "Unexpected failure. Check local and remote results before retrying an upload.";
  const output = json ? JSON.stringify({ ok: false, error: { code, message } }) : `${code}: ${message}`;
  (json ? process.stdout : process.stderr).write(output + "\n");
  process.exitCode = 1;
}
