import { getRuntimeInfo } from '../bootstrap/runtime-info.js';

export function runVersionCommand(write: (value: string) => void = (value) => process.stdout.write(value)): void {
  const runtime = getRuntimeInfo();
  write(`${runtime.title} ${runtime.version}\n`);
}
