export interface Digest {
  hex(value: string): string;
  matches(value: string, expectedHex: string): boolean;
}
