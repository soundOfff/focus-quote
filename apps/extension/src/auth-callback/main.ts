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

const main = async () => {
  try {
    // The user just landed here from Better Auth's redirect. The session
    // cookie is set on the backend domain. Fetch get-session with
    // credentials:include and capture the bearer token from the response.
    const res = await fetch(`${__API_BASE_URL__}/api/auth/get-session`, {
      credentials: "include",
    })
    if (!res.ok) {
      throw new Error(`session fetch ${res.status}`)
    }
    const token = res.headers.get("set-auth-token") ?? ""
    if (!token) {
      throw new Error(
        "Backend did not return a bearer token (is the bearer plugin enabled?).",
      )
    }
    const data = (await res.json()) as { user?: User } | null
    if (!data?.user) {
      throw new Error("No active session.")
    }
    await persist(token, data.user)

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
