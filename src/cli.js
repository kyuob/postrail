#!/usr/bin/env node
import { EXIT_CODES } from "./error-codes.js";
import { parseArguments } from "./arguments.js";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  UserError,
  fail,
  initialize,
  loadConfig,
  loadArticle,
  targets,
  summary,
  preview,
  writeNew,
} from "./core.js";
import { keyflowCommand, printKeyflow } from "./keyflow-command.js";
import { velogCommand, printVelog } from "./velog-command.js";
import { tistoryCommand, printTistory } from "./tistory-command.js";
import { bloggerCommand, printBlogger } from "./blogger-command.js";
import { publishCommand, printPublish } from "./publish-command.js";
import { publishCapabilities } from "./publish.js";
import { inspectImages } from "./images.js";

const { version } = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
const args = process.argv.slice(2);
const json = args.includes("--json");
const help = `Postrail — write once, publish across your blogs.

Usage:
  postrail publish <article.md> --destinations <file> [--to velog,tistory,keyflow,blogger] [--dry-run | --confirm] [--config <file>] [--json]
  postrail init [--json]
  postrail validate <article.md> [--config <file>] [--json]
  postrail images <article.md> [--config <file>] [--json]
  postrail preview <article.md> [--output <new.html>] [--config <file>] [--json]
  postrail plan <article.md> [--to velog,tistory,keyflow,blogger] [--config <file>] [--json]
  postrail keyflow check <article.md> [--config <file>] [--json]
  postrail keyflow login --account <name>
  postrail keyflow status <article.md> --account <name> [--json]
  postrail keyflow push <article.md> --account <name> --confirm [--json]
  postrail velog check <article.md> [--config <file>] [--json]
  postrail velog login --account <username> [--diagnostics]
  postrail velog status <article.md> --account <username> [--json]
  postrail velog get <article.md> --account <username> [--json]
  postrail velog inspect <article.md> --account <username> [--published-to velog,tistory] [--json]
  postrail velog reconcile <article.md> --account <username> --review <hash> --confirm [--accept-tags] [--published-to velog,tistory] [--json]
  postrail velog push <article.md> --account <username> --confirm [--json]
  postrail tistory check <article.md> [--json]
  postrail tistory login --blog <name> --blog-id <id>
  postrail tistory status <article.md> --blog <name> --blog-id <id> [--json]
  postrail tistory get <article.md> --blog <name> --blog-id <id> [--json]
  postrail tistory inspect <article.md> --blog <name> --blog-id <id> [--published-to tistory,velog] [--json]
  postrail tistory reconcile <article.md> --blog <name> --blog-id <id> --review <hash> --confirm [--accept-tags] [--published-to tistory,velog] [--json]
  postrail tistory push <article.md> --blog <name> --blog-id <id> --confirm [--json]
  postrail blogger check <article.md> [--json]
  postrail blogger login --account <name> --client-config <desktop-client.json>
  postrail blogger blogs --account <name> [--json]
  postrail blogger status <article.md> --account <name> --blog-id <id> [--json]
  postrail blogger get <article.md> --account <name> --blog-id <id> [--json]
  postrail blogger inspect <article.md> --account <name> --blog-id <id> [--published-to blogger,velog] [--json]
  postrail blogger reconcile <article.md> --account <name> --blog-id <id> --review <hash> --confirm [--accept-tags] [--published-to blogger,velog] [--json]
  postrail blogger push <article.md> --account <name> --blog-id <id> --confirm [--json]
  postrail --help
  postrail --version

init/validate/images/preview/plan and platform check/status are offline.
KeyFlow login opens a browser; keyflow push sends content after --confirm.
Preview prints HTML unless --output is given.
Existing files are never overwritten. --json returns structured results/errors.
publish --dry-run checks all selected targets offline; --confirm sends sequentially.
Partial results are preserved. Uncertain writes are never automatically retried.
Velog/Tistory/Blogger remain experimental; scoped public and draft/private account tests passed.
Tistory draft slots and Blogger private/local images are unsupported.
Scoped common flows and desktop image-link rendering passed; see the support matrix for limits.`;

function parse() {
  if (!args.length || (args.length === 1 && ["--help", "-h", "help"].includes(args[0])))
    return { command: "help" };
  if (args.length === 1 && ["--version", "-v"].includes(args[0])) return { command: "version" };
  const [command, ...rest] = args;
  if (!["init", "validate", "images", "preview", "plan"].includes(command))
    fail(
      "UNSUPPORTED_COMMAND",
      "Unsupported command or arguments. Run postrail --help for supported commands.",
    );
  const allowed =
    command === "init"
      ? ["--json"]
      : [
          "--json",
          "--config",
          ...(command === "preview" ? ["--output"] : []),
          ...(command === "plan" ? ["--to"] : []),
        ];
  const { options, file } = parseArguments(rest, { allowed, positional: command !== "init" });
  if (command !== "init" && !file) fail("INVALID_ARGUMENT", "An article path is required.");
  return { command, file, options };
}

const commands = {
  keyflow: { run: keyflowCommand, print: printKeyflow },
  velog: { run: velogCommand, print: printVelog },
  tistory: { run: tistoryCommand, print: printTistory },
  blogger: { run: bloggerCommand, print: printBlogger },
  publish: { run: publishCommand, print: printPublish },
};

async function main() {
  if (Object.hasOwn(commands, args[0])) {
    const command = commands[args[0]];
    const result = await command.run(args.slice(1));
    if (json) console.log(JSON.stringify(result));
    else command.print(result);
    if (args[0] === "publish" && !result.ok) process.exitCode = EXIT_CODES.error;
    return;
  }
  const { command, file, options } = parse();
  if (command === "help") return console.log(help);
  if (command === "version") return console.log(version);
  let result;
  if (command === "init") {
    result = { ok: true, command, config: initialize(process.cwd()) };
  } else {
    const config = loadConfig(
      path.resolve(options["--config"] ?? "postrail.json"),
      !!options["--config"],
    );
    if (command === "images") {
      const report = inspectImages(path.resolve(file), config);
      if (json) console.log(JSON.stringify(report));
      else {
        console.log(`Image budget: ${report.title}`);
        for (const image of report.images)
          console.log(
            `  ${JSON.stringify(image.source)}: ${image.kind === "remote" ? "remote; not fetched" : `${image.bytes} bytes${image.excessBytes ? `; exceeds file limit by ${image.excessBytes} bytes` : ""}`}; references=${image.occurrences}`,
          );
        console.log(
          `Local total: ${report.totalBytes}/${report.limits.totalBytes} bytes; excess=${report.excessBytes}; unique files=${report.uniqueFiles} (${report.uniqueFileBytes} bytes)`,
        );
        console.log(`Per-file limit: ${report.limits.fileBytes} bytes`);
        for (const line of report.guidance) console.log(line);
      }
      if (!report.ok) process.exitCode = EXIT_CODES.error;
      return;
    }
    const to =
      options["--to"] === undefined
        ? undefined
        : targets(options["--to"].split(","), "INVALID_ARGUMENT");
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
      result.targets = publishCapabilities(article);
    }
  }
  if (json) console.log(JSON.stringify(result));
  else if (command === "init") console.log(`Created ${result.config}`);
  else {
    console.log(
      `${command === "validate" ? "Valid" : command === "preview" ? "Preview saved" : "Offline plan"}: ${result.article.title}`,
    );
    if (result.output) console.log(result.output);
    if (result.targets)
      for (const target of result.targets)
        console.log(
          `  ${target.platform}: ${target.visibility}, ${target.status} — ${target.blockers.join(", ")}`,
        );
    for (const warning of result.article.warnings) console.log(`Warning: ${warning}`);
  }
}

try {
  await main();
} catch (error) {
  const code = error instanceof UserError ? error.code : "INTERNAL_ERROR";
  const message =
    error instanceof UserError
      ? error.message
      : "Unexpected failure. Check local and remote results before retrying an upload.";
  const output = json
    ? JSON.stringify({ ok: false, error: { code, message } })
    : `${code}: ${message}`;
  (json ? process.stdout : process.stderr).write(output + "\n");
  process.exitCode = EXIT_CODES.error;
}
