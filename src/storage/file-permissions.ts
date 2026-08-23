import { chmodSync, mkdirSync, statSync } from 'node:fs';

export interface PermissionInspection {
  readonly supported: boolean;
  readonly secure: boolean;
  readonly mode: string | null;
}

export function ensurePrivateDirectory(path: string): void {
  mkdirSync(path, { recursive: true, mode: 0o700 });
}

export function restrictPrivateFile(path: string): void {
  if (process.platform !== 'win32') chmodSync(path, 0o600);
}

export function inspectPrivatePermissions(path: string, expectedMask: number): PermissionInspection {
  if (process.platform === 'win32') return { supported: false, secure: true, mode: null };
  const mode = statSync(path).mode & 0o777;
  return {
    supported: true,
    secure: (mode & ~expectedMask) === 0,
    mode: mode.toString(8).padStart(3, '0'),
  };
}
