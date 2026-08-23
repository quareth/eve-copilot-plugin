import { ESLint } from 'eslint';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('architecture import boundaries', () => {
  it.each([
    [
      'src/domain/authorization.ts',
      "import { readFileSync } from 'node:fs';\nexport const value = readFileSync;\n",
      'Domain code must be dependency-free.',
    ],
    [
      'src/application/services/use-case.ts',
      "import { presentResult } from '../../mcp/result-presenter.js';\nexport const value = presentResult;\n",
      'Application code must depend on ports, DTOs, and domain only.',
    ],
  ])('rejects forbidden imports for %s', async (filePath, source, message) => {
    const absolutePath = resolve(filePath);
    const eslint = new ESLint({ cwd: process.cwd() });
    const [result] = await eslint.lintText(source, { filePath: absolutePath });
    expect(result?.messages.some((entry) =>
      entry.ruleId === 'no-restricted-imports' && entry.message.includes(message))).toBe(true);
  });
});
