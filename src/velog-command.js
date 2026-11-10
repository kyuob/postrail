export { printVelog } from "./velog-output.js";
import { parseArguments } from "./arguments.js";
import path from "node:path";
import { fail, loadConfig, loadArticle, targets } from "./core.js";
import { velogAccount } from "./velog-client.js";
import { checkVelog, statusVelog, loginVelog, pushVelog, getVelog } from "./velog.js";
import { inspectVelog, reconcileVelog } from "./velog-recovery.js";

export async function velogCommand(args) {
  const [action, ...rest] = args;
  if (!["check", "status", "login", "push", "get", "inspect", "reconcile"].includes(action))
    fail("INVALID_ARGUMENT", "Use velog check, status, login, push, get, inspect or reconcile.");
  const recovery = ["inspect", "reconcile"].includes(action);
  const allowed =
    action === "login"
      ? ["--account", "--diagnostics", "--chrome-path"]
      : [
          "--json",
          "--config",
          ...(action !== "check" ? ["--account"] : []),
          ...(action === "push" ? ["--confirm"] : []),
          ...(recovery ? ["--published-to"] : []),
          ...(action === "reconcile" ? ["--confirm", "--review", "--accept-tags"] : []),
        ];
  const { options, file } = parseArguments(rest, {
    allowed,
    positional: action !== "login",
    optionError: "Unknown or repeated Velog option.",
    argumentError: "Unexpected Velog argument.",
  });
  if (action !== "check") velogAccount(options["--account"]);
  if (action === "login") {
    console.error(
      `Sign into Velog as @${options["--account"]} in the dedicated Postrail Chrome window. No password or token is needed in this terminal.`,
    );
    return loginVelog(options["--account"], undefined, {
      diagnostics: !!options["--diagnostics"],
      chromePath: options["--chrome-path"],
    });
  }
  if (!file) fail("INVALID_ARGUMENT", "An article path is required.");
  if (action === "push" && !options["--confirm"])
    fail(
      "VELOG_CONFIRM_REQUIRED",
      "Pass --confirm after reviewing the article, account and visibility.",
    );
  if (action === "reconcile" && !options["--confirm"])
    fail(
      "VELOG_RECOVERY_CONFIRM_REQUIRED",
      "Inspect first, then pass --confirm for local reconciliation.",
    );
  if (action === "reconcile" && !/^[a-f0-9]{64}$/.test(options["--review"] ?? ""))
    fail("VELOG_RECOVERY_REVIEW_REQUIRED", "Pass the review hash from velog inspect.");
  const config = loadConfig(
    path.resolve(options["--config"] ?? "postrail.json"),
    !!options["--config"],
  );
  const publishedTo =
    options["--published-to"] === undefined
      ? undefined
      : targets(options["--published-to"].split(","), "INVALID_ARGUMENT");
  if (publishedTo && !publishedTo.includes("velog"))
    fail("INVALID_ARGUMENT", "The original target list must include velog.");
  const article = loadArticle(path.resolve(file), config, recovery ? publishedTo : ["velog"]);
  if (action === "check") return checkVelog(article);
  if (action === "status") return statusVelog(article, options["--account"], process.cwd());
  if (action === "get") return getVelog(article, options["--account"], process.cwd());
  if (action === "inspect") return inspectVelog(article, options["--account"], process.cwd());
  if (action === "reconcile")
    return reconcileVelog(article, options["--account"], process.cwd(), {
      confirmed: options["--confirm"],
      reviewHash: options["--review"],
      acceptTags: !!options["--accept-tags"],
    });
  return pushVelog(article, options["--account"], process.cwd(), options["--confirm"]);
}
