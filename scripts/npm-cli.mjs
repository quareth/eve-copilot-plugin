import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import process from 'node:process';

// JavaScript utility: callers determine whether npm returns text or inherited output.
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export function runNpm(args, options) {
  const npmCli = process.env.npm_execpath
    ?? join(dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js');
  if (!existsSync(npmCli)) {
    throw new Error('The npm CLI entry point could not be resolved. Run this check through npm.');
  }
  return execFileSync(process.execPath, [npmCli, ...args], options);
}
