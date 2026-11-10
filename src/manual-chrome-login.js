import { spawn } from 'node:child_process';
import { fail } from './core.js';

// Authentication is performed by the user in ordinary Chrome. Do not attach
// automation, debugging, or credential-export facilities to this process.
export async function manualChromeLogin(directory, { platform = process.platform, spawnImpl = spawn, service = 'velog', destination = 'https://velog.io/' } = {}) {
  if (!['velog', 'tistory'].includes(service)) fail('INVALID_ARGUMENT', 'Unsupported manual login service.');
  const prefix = service.toUpperCase();
  if ((service === 'velog' && destination !== 'https://velog.io/') || (service === 'tistory' && !/^https:\/\/[a-z0-9][a-z0-9-]{0,61}[a-z0-9]\.tistory\.com\/manage$/.test(destination))) fail(`${prefix}_REQUEST_INVALID`, 'Unsupported manual login destination.');
  if (platform !== 'darwin') fail(`${prefix}_LOGIN_UNSUPPORTED`, 'Manual Chrome login currently supports macOS only.');
  try {
    await new Promise((resolve, reject) => {
      const browser = spawnImpl('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
        `--user-data-dir=${directory}`, '--no-first-run', '--no-default-browser-check', ...(service === 'tistory' ? ['--restore-last-session'] : []), destination,
      ], { stdio: 'ignore', shell: false });
      browser.once('error', reject);
      browser.once('close', (code) => code === 0 ? resolve() : reject(new Error('Browser exited unsuccessfully.')));
    });
  } catch {
    fail(`${prefix}_BROWSER_FAILED`, 'Manual Chrome ended unsuccessfully. Close other Postrail Chrome sessions before trying again. No post was sent.');
  }
}
