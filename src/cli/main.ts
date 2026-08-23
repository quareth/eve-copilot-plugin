import { runDoctorCommand } from './doctor-command.js';
import { runServeCommand } from './serve-command.js';
import { runVersionCommand } from './version-command.js';
import { runSdeCommand } from './sde-command.js';
import { runSetupCommand } from './setup-command.js';
import { loadConfig } from '../config/load-config.js';
import { AppError } from '../domain/errors.js';
import { redactString } from '../observability/redaction.js';

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  if (argv[0] === 'setup') {
    try {
      runSetupCommand({ argv: argv.slice(1) });
    } catch (error) {
      process.stderr.write(`Configuration error: ${safeErrorMessage(error)}\n`);
      process.exitCode = 2;
    }
    return;
  }
  let config;
  try {
    config = loadConfig();
  } catch (error) {
    process.stderr.write(`Configuration error: ${safeErrorMessage(error)}\n`);
    process.exitCode = 2;
    return;
  }

  if (config.command === 'version') {
    runVersionCommand();
    return;
  }
  if (config.command === 'doctor') {
    await runDoctorCommand(config);
    return;
  }
  if (config.command === 'sde') {
    await runSdeCommand(config);
    return;
  }
  await runServeCommand(config);
}

function safeErrorMessage(error: unknown): string {
  if (error instanceof AppError) return error.safeMessage;
  return error instanceof Error ? redactString(error.message) : 'Unknown startup failure';
}

function exitCodeFor(error: unknown): number {
  if (error instanceof AppError && error.code === 'INVALID_CONFIGURATION') return 2;
  if (error instanceof AppError && error.code === 'DATABASE_UNAVAILABLE') return 3;
  return process.exitCode === 4 ? 4 : 1;
}

void main().catch((error: unknown) => {
  process.stderr.write(`Fatal startup error: ${safeErrorMessage(error)}\n`);
  process.exitCode = exitCodeFor(error);
});
