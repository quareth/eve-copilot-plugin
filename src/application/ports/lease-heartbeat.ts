export interface LeaseHeartbeat {
  start(input: {
    readonly intervalMs: number;
    readonly signal: AbortSignal;
    readonly beat: () => void;
  }): () => void;
}
