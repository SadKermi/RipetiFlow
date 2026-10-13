// Bridge between the API client and the auth layer, so neither imports the other: the AuthProvider
// registers how to get a token and what to do on 401; the client just asks.

export interface SessionBridge {
  /** Current access token (refreshed by the auth layer when needed), or null when signed out. */
  getAccessToken: () => Promise<string | null>;
  /** Called once per 401 from the API: the auth layer signs out and the router sends to /accedi. */
  onUnauthorized: () => void;
}

const signedOut: SessionBridge = {
  getAccessToken: () => Promise.resolve(null),
  onUnauthorized: () => undefined,
};

let current: SessionBridge = signedOut;

/** Registers the auth layer; returns a function that restores the previous bridge. */
export function setSessionBridge(bridge: SessionBridge): () => void {
  const previous = current;
  current = bridge;
  return () => {
    if (current === bridge) current = previous;
  };
}

export function getAccessToken(): Promise<string | null> {
  return current.getAccessToken();
}

export function notifyUnauthorized(): void {
  current.onUnauthorized();
}
