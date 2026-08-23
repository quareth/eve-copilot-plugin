import { spawn } from 'node:child_process';
import type { BrowserLauncher } from '../application/ports/browser-launcher.js';

export class SystemBrowserLauncher implements BrowserLauncher {
  open(url: string): Promise<boolean> {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' || parsed.hostname !== 'login.eveonline.com') {
      return Promise.resolve(false);
    }
    const command = browserCommand(url);
    if (command === null) return Promise.resolve(false);
    return new Promise((resolve) => {
      try {
        const child = spawn(command.executable, command.arguments, {
          detached: true,
          stdio: 'ignore',
          windowsHide: true,
        });
        child.once('error', () => { resolve(false); });
        child.once('spawn', () => {
          child.unref();
          resolve(true);
        });
      } catch {
        resolve(false);
      }
    });
  }
}

function browserCommand(url: string): { readonly executable: string; readonly arguments: readonly string[] } | null {
  if (process.platform === 'darwin') return { executable: 'open', arguments: [url] };
  if (process.platform === 'win32') {
    return { executable: 'rundll32.exe', arguments: ['url.dll,FileProtocolHandler', url] };
  }
  if (process.platform === 'linux') return { executable: 'xdg-open', arguments: [url] };
  return null;
}
