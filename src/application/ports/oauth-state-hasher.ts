export interface OAuthStateHasher {
  digest(state: string): Uint8Array;
  matches(left: Uint8Array, right: Uint8Array): boolean;
}
