#!/usr/bin/env node

import { chmod, readFile, writeFile } from 'node:fs/promises';
import { URL } from 'node:url';

const entrypoint = new URL('../dist/cli/main.js', import.meta.url);
const compiled = await readFile(entrypoint, 'utf8');
if (!compiled.startsWith('#!/usr/bin/env node')) {
  await writeFile(entrypoint, `#!/usr/bin/env node\n${compiled}`, 'utf8');
}
await chmod(entrypoint, 0o755);
