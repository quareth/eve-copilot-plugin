import { describe, expect, it } from 'vitest';
import { runVersionCommand } from '../../../src/cli/version-command.js';

describe('runVersionCommand', () => {
  it('writes the product title and version', () => {
    let output = '';
    runVersionCommand((value) => { output += value; });
    expect(output).toBe('EVE Copilot MCP 0.1.4\n');
  });
});
