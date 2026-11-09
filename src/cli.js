#!/usr/bin/env node
import { readFileSync } from "node:fs";
import path from "node:path";
import { UserError, fail, initialize, loadConfig, loadArticle, targets, summary, preview, writeNew } from "./core.js";

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
  postrail plan <article.md> [--to velog,tistory,keyflow] [--config <file>] [--json]
  postrail --help
  postrail --version

All article commands are offline. Preview prints HTML unless --output is given.
Existing files are never overwritten. --json returns structured results/errors.
Platform publishing is not available yet. Plans report unverified adapters.`;

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

function main() {
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
      result.targets = article.meta.targets.map(platform => ({ platform, visibility: article.meta.visibility, status: "unverified", canPublish: false, blockers: ["ADAPTER_NOT_IMPLEMENTED"] }));
    }
  }
  if (json) console.log(JSON.stringify(result));
  else if (command === "init") console.log(`Created ${result.config}`);
  else {
    console.log(`${command === "validate" ? "Valid" : command === "preview" ? "Preview saved" : "Offline plan"}: ${result.article.title}`);
    if (result.output) console.log(result.output);
    if (result.targets) for (const target of result.targets) console.log(`  ${target.platform}: ${target.visibility}, unverified — publishing unavailable`);
    for (const warning of result.article.warnings) console.log(`Warning: ${warning}`);
  }
}

try { main(); }
catch (error) {
  const code = error instanceof UserError ? error.code : "INTERNAL_ERROR";
  const message = error instanceof UserError ? error.message : "Unexpected failure. No content was uploaded.";
  const output = json ? JSON.stringify({ ok: false, error: { code, message } }) : `${code}: ${message}`;
  (json ? process.stdout : process.stderr).write(output + "\n");
  process.exitCode = 1;
}
