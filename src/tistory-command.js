import path from 'node:path';
import { fail, loadArticle, loadConfig } from './core.js';
import { tistoryTarget } from './tistory-client.js';
import { checkTistory, statusTistory, loginTistory, pushTistory, getTistory } from './tistory.js';

export async function tistoryCommand(args) {
  const [action, ...rest] = args;
  if (!['check', 'status', 'login', 'push', 'get'].includes(action)) fail('INVALID_ARGUMENT', 'Use tistory check, status, login, push or get.');
  const allowed = action === 'login' ? ['--blog', '--blog-id'] : ['--json', '--config', ...(action === 'check' ? [] : ['--blog', '--blog-id']), ...(action === 'push' ? ['--confirm'] : [])];
  const options = {}; let file;
  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i];
    if (arg.startsWith('-')) {
      if (!allowed.includes(arg) || Object.hasOwn(options, arg)) fail('INVALID_ARGUMENT', 'Unknown or repeated Tistory option.');
      if (['--json', '--confirm'].includes(arg)) options[arg] = true;
      else { const value = rest[++i]; if (!value || value.startsWith('-')) fail('INVALID_ARGUMENT', 'Option requires a value.'); options[arg] = value; }
    } else if (file || action === 'login') fail('INVALID_ARGUMENT', 'Unexpected Tistory argument.');
    else file = arg;
  }
  const target = action === 'check' ? undefined : tistoryTarget(options['--blog'], options['--blog-id']);
  if (action === 'login') {
    console.error('Sign into the requested Tistory blog in the dedicated Postrail Chrome window. Complete any verification yourself; no password or cookie is needed in this terminal.');
    return loginTistory(target);
  }
  if (!file) fail('INVALID_ARGUMENT', 'An article path is required.');
  if (action === 'push' && !options['--confirm']) fail('TISTORY_CONFIRM_REQUIRED', 'Review the article and destination, then pass --confirm.');
  const config = loadConfig(path.resolve(options['--config'] ?? 'postrail.json'), !!options['--config']);
  const article = loadArticle(path.resolve(file), config, ['tistory']);
  if (action === 'check') return checkTistory(article);
  if (action === 'status') return statusTistory(article, target, process.cwd());
  if (action === 'get') return getTistory(article, target, process.cwd());
  return pushTistory(article, target, process.cwd(), true);
}
