export interface DB {
  exec(sql: string): void;
  prepare(sql: string): Statement;
  transaction?<T>(fn: () => T): () => T;
}

export interface Statement {
  run(...params: unknown[]): void;
  get(...params: unknown[]): unknown;
  all(...params: unknown[]): unknown[];
}
