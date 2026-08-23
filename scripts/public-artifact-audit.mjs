#!/usr/bin/env node

import process from 'node:process';
import { runNpm } from './npm-cli.mjs';

const output = runNpm(['pack', '--dry-run', '--json'], {
  encoding: 'utf8',
  stdio: ['ignore', 'pipe', 'inherit'],
});
const [pack] = JSON.parse(output);
const files = pack.files.map((entry) => entry.path);
const required = ['LICENSE', 'NOTICE', 'README.md', 'package.json', 'dist/cli/main.js'];
const missing = required.filter((path) => !files.includes(path));
const forbidden = files.filter((path) =>
  /(^|\/)(?:\.env(?:\.|$)|data|coverage|node_modules)(?:\/|$)|\.(?:db|sqlite|log)(?:$|-)/u.test(path),
);
const unexpected = files.filter((path) => !(
  path === 'LICENSE'
  || path === 'NOTICE'
  || path === 'README.md'
  || path === 'package.json'
  || path.startsWith('vendor/dogma-engine/')
  || path.startsWith('dist/')
  || path === 'docs/attribution.md'
  || path === 'docs/esi-coverage.md'
  || path === 'docs/esi-coverage.json'
  || path === 'docs/capability-catalog.md'
  || path === 'docs/scope-bundles.md'
  || path === 'docs/action-safety.md'
  || path === 'docs/eve-guide.md'
  || path === 'docs/privacy.md'
  || path === 'docs/troubleshooting.md'
  || path === 'docs/limitations.md'
  || path === 'docs/plugin-system.md'
  || path.startsWith('docs/client-setup/')
));
if (missing.length > 0) {
  process.stderr.write(`Missing required package files:\n${missing.join('\n')}\n`);
  process.exitCode = 1;
}
if (forbidden.length > 0) {
  process.stderr.write(`Forbidden package files:\n${forbidden.join('\n')}\n`);
  process.exitCode = 1;
}
if (unexpected.length > 0) {
  process.stderr.write(`Unexpected package files:\n${unexpected.join('\n')}\n`);
  process.exitCode = 1;
}
