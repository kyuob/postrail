#!/usr/bin/env node
import { readFileSync } from "node:fs";

const { version } = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8"),
);
const args = process.argv.slice(2);

if (args.length === 0 || (args.length === 1 && ["--help", "-h", "help"].includes(args[0]))) {
  console.log(`Postrail — write once, publish across your blogs.

Usage:
  postrail --help
  postrail --version

Status: initial scaffold. Platform publishing is not available yet.
Planned platforms: Velog, Tistory, KeyFlow.`);
} else if (args.length === 1 && ["--version", "-v"].includes(args[0])) {
  console.log(version);
} else {
  console.error("Unsupported command or arguments. Run postrail --help. Publishing is not implemented yet.");
  process.exitCode = 1;
}
