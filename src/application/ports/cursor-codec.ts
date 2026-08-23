export interface CursorCodec {
  encode(value: string): string;
  decode(value: string): string;
}
