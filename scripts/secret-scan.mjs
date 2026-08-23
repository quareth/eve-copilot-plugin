#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const paths = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'])
  .toString('utf8').split('\0').filter(Boolean);
const patterns = [
  ['private key', /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/u],
  ['AWS access key', /\bAKIA[0-9A-Z]{16}\b/u],
  ['GitHub token', /\bgh[opusr]_[A-Za-z0-9]{30,}\b/u],
  ['model-provider token', /\bsk-[A-Za-z0-9_-]{20,}\b/u],
  ['configured EVE client secret', /EVE_COPILOT_EVE_CLIENT_SECRET\s*=/u],
  ['JSON client secret', /"client_secret"\s*:\s*"(?!redacted|example|test)[^"]+"/iu],
];
const findings = [];
for (const path of paths) {
  if (path === 'scripts/secret-scan.mjs') continue;
  let text;
  try { text = readFileSync(path, 'utf8'); } catch { continue; }
  if (text.includes('\0')) continue;
  for (const [label, pattern] of patterns) {
    if (pattern.test(text)) findings.push(`${path}: ${label}`);
  }
}
if (findings.length > 0) throw new Error(`Secret scan found prohibited material:\n${findings.join('\n')}`);
