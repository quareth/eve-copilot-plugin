export interface BrowserLauncher {
  open(url: string): Promise<boolean>;
}
