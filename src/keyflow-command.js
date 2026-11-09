import path from "node:path";
import { fail, loadConfig, loadArticle } from "./core.js";
import { accountName, checkKeyflow, loginKeyflow, pushKeyflow, statusKeyflow } from "./keyflow.js";

export function keyflowCommand(args) {
  const [action, ...rest] = args;
  if (!["check", "login", "push", "status"].includes(action)) fail("INVALID_ARGUMENT", "Use keyflow check, login, push or status. Run postrail --help.");
  const options = {};
  let file;
  const allowed = action === "login" ? ["--account"] : ["--json", "--config", ...(action !== "check" ? ["--account"] : []), ...(action === "push" ? ["--confirm"] : [])];
  for (let i = 0; i < rest.length; i++) {
    const argument = rest[i];
    if (argument.startsWith("-")) {
      if (!allowed.includes(argument) || Object.hasOwn(options, argument)) fail("INVALID_ARGUMENT", "Unknown or repeated KeyFlow option.");
      if (["--json", "--confirm"].includes(argument)) options[argument] = true;
      else {
        const value = rest[++i];
        if (!value || value.startsWith("-")) fail("INVALID_ARGUMENT", "Option requires a value.");
        options[argument] = value;
      }
    } else if (file || action === "login") fail("INVALID_ARGUMENT", "Unexpected KeyFlow argument.");
    else file = argument;
  }
  if (action === "login") return loginKeyflow(accountName(options["--account"]));
  if (!file) fail("INVALID_ARGUMENT", "An article path is required.");
  if (action !== "check") accountName(options["--account"]);
  if (action === "push" && !options["--confirm"]) fail("KEYFLOW_CONFIRM_REQUIRED", "Review the article, account and visibility, then pass --confirm to upload.");
  const config = loadConfig(path.resolve(options["--config"] ?? "postrail.json"), !!options["--config"]);
  const article = loadArticle(path.resolve(file), config, ["keyflow"]);
  if (action === "check") return checkKeyflow(article);
  if (action === "status") return statusKeyflow(article, options["--account"], process.cwd());
  return pushKeyflow(article, options["--account"], process.cwd(), options["--confirm"]);
}
