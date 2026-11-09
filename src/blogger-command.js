import path from 'node:path';
import { fail, loadArticle, loadConfig } from './core.js';
import { accountName, numericId } from './blogger-client.js';
import { loginAccount } from './blogger-auth.js';
import { checkBlogger, statusBlogger, blogsBlogger, getBlogger, pushBlogger } from './blogger.js';

export async function bloggerCommand(args) {
  const [action, ...rest] = args;
  if (!['check', 'status', 'login', 'blogs', 'get', 'push'].includes(action)) fail('INVALID_ARGUMENT', 'Use blogger check, status, login, blogs, get or push.');
  const allowed = action === 'login' ? ['--account', '--client-config'] : action === 'blogs' ? ['--account', '--json'] : ['--json', '--config', ...(action === 'check' ? [] : ['--account', '--blog-id']), ...(action === 'push' ? ['--confirm'] : [])];
  const options = {}; let file;
  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i];
    if (arg.startsWith('-')) {
      if (!allowed.includes(arg) || Object.hasOwn(options, arg)) fail('INVALID_ARGUMENT', 'Unknown or repeated Blogger option.');
      if (['--json', '--confirm'].includes(arg)) options[arg] = true;
      else { const value = rest[++i]; if (!value || value.startsWith('-')) fail('INVALID_ARGUMENT', 'Option requires a value.'); options[arg] = value; }
    } else if (file || ['login', 'blogs'].includes(action)) fail('INVALID_ARGUMENT', 'Unexpected Blogger argument.');
    else file = arg;
  }
  if (action !== 'check') accountName(options['--account']);
  if (action === 'login') {
    if (!options['--client-config']) fail('BLOGGER_CLIENT_REQUIRED', 'Pass --client-config with a Desktop OAuth client JSON file stored outside the repository (mode 0600).');
    console.error('Complete Google consent in your system browser. No password or token is needed in this terminal.');
    return loginAccount(options['--account'], path.resolve(options['--client-config']));
  }
  if (action === 'blogs') return blogsBlogger(options['--account']);
  if (action !== 'check') numericId(options['--blog-id']);
  if (!file) fail('INVALID_ARGUMENT', 'An article path is required.');
  if (action === 'push' && !options['--confirm']) fail('BLOGGER_CONFIRM_REQUIRED', 'Review the article and target, then pass --confirm.');
  const config = loadConfig(path.resolve(options['--config'] ?? 'postrail.json'), !!options['--config']);
  const article = loadArticle(path.resolve(file), config, ['blogger']);
  if (action === 'check') return checkBlogger(article);
  if (action === 'status') return statusBlogger(article, options['--account'], options['--blog-id'], process.cwd());
  if (action === 'get') return getBlogger(article, options['--account'], options['--blog-id'], process.cwd());
  return pushBlogger(article, options['--account'], options['--blog-id'], process.cwd(), true);
}
