import "../styles/tailwind.css"
import { AUTH_TOKEN_KEY, AUTH_USER_KEY } from "../shared/auth-storage"
import type { User } from "@focus-quote/shared"

const statusEl = document.getElementById("status") as HTMLElement | null
const errorEl = document.getElementById("error") as HTMLElement | null

const showError = (msg: string) => {
  if (statusEl) statusEl.textContent = "Couldn't sign you in."
  if (errorEl) {
    errorEl.textContent = msg
    errorEl.classList.remove("hidden")
  }
}

const setStatus = (msg: string) => {
  if (statusEl) statusEl.textContent = msg
}

const persist = (token: string, user: User) =>
  new Promise<void>((resolve, reject) => {
    chrome.storage.local.set(
      { [AUTH_TOKEN_KEY]: token, [AUTH_USER_KEY]: user },
      () => {
        if (chrome.runtime.lastError) {
          reject(
            new Error(
              chrome.runtime.lastError.message ?? "storage.set failed",
            ),
          )
        } else {
          resolve()
        }
      },
    )
  })

const decodeUser = (encoded: string): User => {
  // base64(utf8(JSON)) — matches the server bridge's encoding
  const bin = atob(encoded)
  const json = decodeURIComponent(escape(bin))
  return JSON.parse(json) as User
}

const main = async () => {
  try {
    // The server-side magic-link bridge redirected here with the bearer token
    // and user payload in the URL fragment. Fragments aren't sent to servers,
    // so this is safe to consume here.
    const hash = window.location.hash.startsWith("#")
      ? window.location.hash.slice(1)
      : window.location.hash
    const params = new URLSearchParams(hash)
    const token = params.get("token") ?? ""
    const userParam = params.get("user") ?? ""
    if (!token || !userParam) {
      throw new Error("Missing token or user in callback URL.")
    }
    const user = decodeUser(userParam)
    await persist(token, user)

    // Clear the fragment so the token isn't left in the address bar / history.
    window.history.replaceState(null, "", window.location.pathname)

    // Wake any open extension contexts (popup, newtab) so they re-render.
    chrome.runtime
      .sendMessage({ type: "focusquote.auth.signedIn" })
      .catch(() => {
        /* no listener — ignore */
      })

    setStatus("You're signed in. You can close this tab.")
    setTimeout(() => {
      window.close()
    }, 1200)
  } catch (err) {
    showError(err instanceof Error ? err.message : String(err))
  }
}

void main()
