export { printPublish } from "./publish-output.js";
import { parseArguments } from "./arguments.js";
import path from "node:path";
import { fail, targets, loadConfig, loadArticle } from "./core.js";
import { loadDestinations, publishArticle } from "./publish.js";

export async function publishCommand(args) {
  const allowed = ["--config", "--destinations", "--to", "--confirm", "--dry-run", "--json"];
  const { options, file } = parseArguments(args, {
    allowed,
    positional: true,
    optionError: "Unknown or repeated publish option.",
    argumentError: "Pass exactly one article path.",
  });
  if (!file) fail("INVALID_ARGUMENT", "An article path is required.");
  if (!options["--dry-run"] && !options["--confirm"])
    fail("PUBLISH_CONFIRM_REQUIRED", "Pass --dry-run to review or --confirm to send the article.");
  if (!options["--destinations"])
    fail(
      "PUBLISH_DESTINATION_REQUIRED",
      "Pass --destinations with the nonsecret account and blog mapping.",
    );
  const config = loadConfig(
    path.resolve(options["--config"] ?? "postrail.json"),
    !!options["--config"],
  );
  const to =
    options["--to"] === undefined
      ? undefined
      : targets(options["--to"].split(","), "INVALID_ARGUMENT");
  const article = loadArticle(path.resolve(file), config, to);
  return publishArticle(
    article,
    loadDestinations(path.resolve(options["--destinations"])),
    process.cwd(),
    { confirmed: !!options["--confirm"], dryRun: !!options["--dry-run"] },
  );
}
