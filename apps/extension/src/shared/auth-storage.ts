/**
 * Storage keys for the user auth state. The token is the Better Auth
 * session token (used as a Bearer credential by the bearer plugin),
 * stored in chrome.storage.local — sandboxed per extension.
 */
export const AUTH_TOKEN_KEY = "focusquote.authToken"
export const AUTH_USER_KEY = "focusquote.user"
