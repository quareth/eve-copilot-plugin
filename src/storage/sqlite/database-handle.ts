import type Database from 'better-sqlite3';

export interface DatabaseHandle {
  readonly raw: Database.Database;
  readonly path: string;
  close(): void;
}

export class SqliteDatabaseHandle implements DatabaseHandle {
  readonly raw: Database.Database;
  readonly path: string;
  private closed = false;

  constructor(raw: Database.Database, path: string) {
    this.raw = raw;
    this.path = path;
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.raw.close();
  }
}
