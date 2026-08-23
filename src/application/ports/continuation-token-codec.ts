export interface ContinuationTokenCodec {
  encode(continuationId: string): string;
  decode(token: string): string;
}
