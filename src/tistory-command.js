export { printTistory } from "./tistory-output.js";
import { parseArguments } from "./arguments.js";
import path from 'node:path';
import { fail, loadArticle, loadConfig, targets } from './core.js';
import { tistoryTarget } from './tistory-client.js';
import { checkTistory, statusTistory, loginTistory, pushTistory, getTistory } from './tistory.js';
import { inspectTistory, reconcileTistory } from './platform-recovery.js';
import { recoveryOptions } from './recovery-journal.js';

export async function tistoryCommand(args) {
  const [action, ...rest] = args;
  if (!['check', 'status', 'login', 'push', 'get', 'inspect', 'reconcile'].includes(action)) fail('INVALID_ARGUMENT', 'Use tistory check, status, login, push, get, inspect or reconcile.');
  const recovery = ['inspect', 'reconcile'].includes(action);
  const allowed = action === 'login' ? ['--blog', '--blog-id', '--chrome-path'] : ['--json', '--config', ...(action === 'check' ? [] : ['--blog', '--blog-id']), ...(action === 'push' ? ['--confirm'] : []), ...(recovery ? ['--published-to'] : []), ...(action === 'reconcile' ? ['--confirm', '--review', '--accept-tags'] : [])];
  const { options, file } = parseArguments(rest, {
    allowed, positional: action !== 'login',
    optionError: "Unknown or repeated Tistory option.",
    argumentError: "Unexpected Tistory argument.",
  });
  const target = action === 'check' ? undefined : tistoryTarget(options['--blog'], options['--blog-id']);
  if (action === 'login') {
    console.error('Sign into the requested Tistory blog in the dedicated Postrail Chrome window. Complete any verification yourself; no password or cookie is needed in this terminal.');
    return loginTistory(target, undefined, { chromePath: options['--chrome-path'] });
  }
  if (!file) fail('INVALID_ARGUMENT', 'An article path is required.');
  if (action === 'push' && !options['--confirm']) fail('TISTORY_CONFIRM_REQUIRED', 'Review the article and destination, then pass --confirm.');
  const recoveryInput = { confirmed: !!options['--confirm'], reviewHash: options['--review'], acceptTags: !!options['--accept-tags'] };
  if (action === 'reconcile') recoveryOptions('TISTORY', recoveryInput);
  const config = loadConfig(path.resolve(options['--config'] ?? 'postrail.json'), !!options['--config']);
  const publishedTo = options['--published-to'] === undefined ? undefined : targets(options['--published-to'].split(','), 'INVALID_ARGUMENT');
  if (publishedTo && !publishedTo.includes('tistory')) fail('INVALID_ARGUMENT', 'The original target list must include tistory.');
  const article = loadArticle(path.resolve(file), config, recovery ? publishedTo : ['tistory']);
  if (action === 'check') return checkTistory(article);
  if (action === 'status') return statusTistory(article, target, process.cwd());
  if (action === 'get') return getTistory(article, target, process.cwd());
  if (action === 'inspect') return inspectTistory(article, target, process.cwd());
  if (action === 'reconcile') return reconcileTistory(article, target, process.cwd(), recoveryInput);
  return pushTistory(article, target, process.cwd(), true);
}
