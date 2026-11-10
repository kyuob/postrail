import { fail } from './core.js';

// Command modules retain their own allowed options and validation order.
export function parseArguments(args, {
  allowed,
  flags = ['--json', '--confirm', '--diagnostics', '--accept-tags', '--dry-run'],
  positional = true,
  optionError = 'Unknown or repeated option. Run postrail --help.',
  argumentError = 'Unexpected argument. Run postrail --help.',
}) {
  const options = {};
  let file;
  for (let index = 0; index < args.length; index++) {
    const argument = args[index];
    if (argument.startsWith('-')) {
      if (!allowed.includes(argument) || Object.hasOwn(options, argument)) fail('INVALID_ARGUMENT', optionError);
      if (flags.includes(argument)) options[argument] = true;
      else {
        const value = args[++index];
        if (!value || value.startsWith('-')) fail('INVALID_ARGUMENT', 'Option requires a value.');
        options[argument] = value;
      }
    } else if (file || !positional) fail('INVALID_ARGUMENT', argumentError);
    else file = argument;
  }
  return { options, file };
}
