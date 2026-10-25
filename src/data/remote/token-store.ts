/**
 * Holds the REST access token. The default implementation keeps it in memory
 * only, so it is never written to unencrypted AsyncStorage. For persistent
 * sign-in in production, implement this interface with expo-secure-store.
 */
export interface TokenStore {
  get(): string | null;
  set(token: string): void;
  clear(): void;
}

export class InMemoryTokenStore implements TokenStore {
  private token: string | null = null;

  get(): string | null {
    return this.token;
  }

  set(token: string): void {
    this.token = token;
  }

  clear(): void {
    this.token = null;
  }
}
