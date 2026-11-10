import path from 'node:path';
import { fail, loadArticle, loadConfig, targets } from './core.js';
import { accountName, numericId } from './blogger-client.js';
import { loginAccount } from './blogger-auth.js';
import { checkBlogger, statusBlogger, blogsBlogger, getBlogger, pushBlogger } from './blogger.js';
import { inspectBlogger, reconcileBlogger } from './platform-recovery.js';
import { recoveryOptions } from './recovery-journal.js';

export async function bloggerCommand(args) {
  const [action, ...rest] = args;
  if (!['check', 'status', 'login', 'blogs', 'get', 'push', 'inspect', 'reconcile'].includes(action)) fail('INVALID_ARGUMENT', 'Use blogger check, status, login, blogs, get, push, inspect or reconcile.');
  const recovery = ['inspect', 'reconcile'].includes(action);
  const allowed = action === 'login' ? ['--account', '--client-config'] : action === 'blogs' ? ['--account', '--json'] : ['--json', '--config', ...(action === 'check' ? [] : ['--account', '--blog-id']), ...(action === 'push' ? ['--confirm'] : []), ...(recovery ? ['--published-to'] : []), ...(action === 'reconcile' ? ['--confirm', '--review', '--accept-tags'] : [])];
  const options = {}; let file;
  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i];
    if (arg.startsWith('-')) {
      if (!allowed.includes(arg) || Object.hasOwn(options, arg)) fail('INVALID_ARGUMENT', 'Unknown or repeated Blogger option.');
      if (['--json', '--confirm', '--accept-tags'].includes(arg)) options[arg] = true;
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
  const recoveryInput = { confirmed: !!options['--confirm'], reviewHash: options['--review'], acceptTags: !!options['--accept-tags'] };
  if (action === 'reconcile') recoveryOptions('BLOGGER', recoveryInput);
  const config = loadConfig(path.resolve(options['--config'] ?? 'postrail.json'), !!options['--config']);
  const publishedTo = options['--published-to'] === undefined ? undefined : targets(options['--published-to'].split(','), 'INVALID_ARGUMENT');
  if (publishedTo && !publishedTo.includes('blogger')) fail('INVALID_ARGUMENT', 'The original target list must include blogger.');
  const article = loadArticle(path.resolve(file), config, recovery ? publishedTo : ['blogger']);
  if (action === 'check') return checkBlogger(article);
  if (action === 'status') return statusBlogger(article, options['--account'], options['--blog-id'], process.cwd());
  if (action === 'get') return getBlogger(article, options['--account'], options['--blog-id'], process.cwd());
  if (action === 'inspect') return inspectBlogger(article, options['--account'], options['--blog-id'], process.cwd());
  if (action === 'reconcile') return reconcileBlogger(article, options['--account'], options['--blog-id'], process.cwd(), recoveryInput);
  return pushBlogger(article, options['--account'], options['--blog-id'], process.cwd(), true);
}
