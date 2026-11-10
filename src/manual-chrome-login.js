import { spawn } from "node:child_process";
import path from "node:path";
import { fail } from "./core.js";

export function chromeExecutable(value = process.env.POSTRAIL_CHROME_PATH) {
  if (value === undefined) return undefined;
  if (
    typeof value !== "string" ||
    !path.isAbsolute(value) ||
    /[\x00-\x1f\x7f]/.test(value) ||
    !value.endsWith(".app/Contents/MacOS/Google Chrome")
  )
    fail(
      "INVALID_ARGUMENT",
      "Chrome path must be the absolute executable path inside your Google Chrome app.",
    );
  return value;
}

// Authentication is performed by the user in ordinary Chrome. Do not attach
// automation, debugging, or credential-export facilities to this process.
export async function manualChromeLogin(
  directory,
  {
    platform = process.platform,
    spawnImpl = spawn,
    service = "velog",
    destination = "https://velog.io/",
    chromePath,
  } = {},
) {
  if (!["velog", "tistory"].includes(service))
    fail("INVALID_ARGUMENT", "Unsupported manual login service.");
  const prefix = service.toUpperCase();
  if (
    (service === "velog" && destination !== "https://velog.io/") ||
    (service === "tistory" &&
      !/^https:\/\/[a-z0-9][a-z0-9-]{0,61}[a-z0-9]\.tistory\.com\/manage$/.test(destination))
  )
    fail(`${prefix}_REQUEST_INVALID`, "Unsupported manual login destination.");
  if (platform !== "darwin")
    fail(`${prefix}_LOGIN_UNSUPPORTED`, "Manual Chrome login currently supports macOS only.");
  const executable =
    chromeExecutable(chromePath) ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
  try {
    await new Promise((resolve, reject) => {
      const browser = spawnImpl(
        executable,
        [
          `--user-data-dir=${directory}`,
          "--no-first-run",
          "--no-default-browser-check",
          ...(service === "tistory" ? ["--restore-last-session"] : []),
          destination,
        ],
        { stdio: "ignore", shell: false },
      );
      browser.once("error", reject);
      browser.once("close", (code) =>
        code === 0 ? resolve() : reject(new Error("Browser exited unsuccessfully.")),
      );
    });
  } catch {
    fail(
      `${prefix}_BROWSER_FAILED`,
      "Manual Chrome ended unsuccessfully. Close other Postrail Chrome sessions before trying again. No post was sent.",
    );
  }
}
