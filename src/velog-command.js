import path from "node:path";
import { fail, loadConfig, loadArticle } from "./core.js";
import { velogAccount } from "./velog-client.js";
import { checkVelog, statusVelog, loginVelog, pushVelog, getVelog } from "./velog.js";

export async function velogCommand(args) {
  const [action, ...rest] = args;
  if (!["check", "status", "login", "push", "get"].includes(action)) fail("INVALID_ARGUMENT", "Use velog check, status, login, push or get.");
  const allowed = action === "login" ? ["--account", "--diagnostics"] : ["--json", "--config", ...(action !== "check" ? ["--account"] : []), ...(action === "push" ? ["--confirm"] : [])];
  const options = {}; let file;
  for (let i = 0; i < rest.length; i++) {
    const argument = rest[i];
    if (argument.startsWith("-")) {
      if (!allowed.includes(argument) || Object.hasOwn(options, argument)) fail("INVALID_ARGUMENT", "Unknown or repeated Velog option.");
      if (["--json", "--confirm", "--diagnostics"].includes(argument)) options[argument] = true;
      else { const value = rest[++i]; if (!value || value.startsWith("-")) fail("INVALID_ARGUMENT", "Option requires a value."); options[argument] = value; }
    } else if (file || action === "login") fail("INVALID_ARGUMENT", "Unexpected Velog argument.");
    else file = argument;
  }
  if (action !== "check") velogAccount(options["--account"]);
  if (action === "login") {
    console.error(`Sign into Velog as @${options["--account"]} in the dedicated Postrail Chrome window. No password or token is needed in this terminal.`);
    return loginVelog(options["--account"], undefined, { diagnostics: !!options["--diagnostics"] });
  }
  if (!file) fail("INVALID_ARGUMENT", "An article path is required.");
  if (action === "push" && !options["--confirm"]) fail("VELOG_CONFIRM_REQUIRED", "Pass --confirm after reviewing the article, account and visibility.");
  const config = loadConfig(path.resolve(options["--config"] ?? "postrail.json"), !!options["--config"]);
  const article = loadArticle(path.resolve(file), config, ["velog"]);
  if (action === "check") return checkVelog(article);
  if (action === "status") return statusVelog(article, options["--account"], process.cwd());
  if (action === "get") return getVelog(article, options["--account"], process.cwd());
  return pushVelog(article, options["--account"], process.cwd(), options["--confirm"]);
}
