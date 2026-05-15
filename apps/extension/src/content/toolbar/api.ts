/**
 * Server proxy for the in-page toolbar.
 *
 * A direct `fetch` from a content script uses the *page's* origin (e.g.
 * `https://news.ycombinator.com`), which our server's CORS allowlist will
 * reject. So we forward the call to the service worker via
 * `chrome.runtime.sendMessage`; the SW makes the actual request with the
 * extension's origin and the bearer token attached. See
 * `apps/extension/src/background/service-worker.ts`.
 */

import type {
  ApiProxyMessage,
  ApiProxyResponse,
} from "../../shared/messages"

export class ApiCallError extends Error {
  readonly status: number | null
  constructor(message: string, status: number | null = null) {
    super(message)
    this.status = status
    this.name = "ApiCallError"
  }
}

const sendViaSW = (
  message: ApiProxyMessage,
  signal?: AbortSignal,
): Promise<ApiProxyResponse> =>
  new Promise<ApiProxyResponse>((resolve, reject) => {
    if (signal?.aborted) {
      reject(
        Object.assign(new Error("Aborted"), { name: "AbortError" }),
      )
      return
    }
    const onAbort = () => {
      reject(
        Object.assign(new Error("Aborted"), { name: "AbortError" }),
      )
    }
    signal?.addEventListener("abort", onAbort, { once: true })

    try {
      chrome.runtime.sendMessage(message, (response: ApiProxyResponse) => {
        signal?.removeEventListener("abort", onAbort)
        const err = chrome.runtime.lastError
        if (err) {
          resolve({
            ok: false,
            status: null,
            error: err.message ?? "Background worker unreachable",
          })
          return
        }
        if (!response) {
          resolve({
            ok: false,
            status: null,
            error: "Empty response from background worker",
          })
          return
        }
        resolve(response)
      })
    } catch (err) {
      signal?.removeEventListener("abort", onAbort)
      resolve({
        ok: false,
        status: null,
        error: err instanceof Error ? err.message : String(err),
      })
    }
  })

export const apiPost = async <T>(
  path: string,
  body: unknown,
  signal?: AbortSignal,
): Promise<T> => {
  const response = await sendViaSW(
    { type: "focusquote.apiProxy", path, method: "POST", body },
    signal,
  )
  if (!response.ok) {
    throw new ApiCallError(response.error, response.status)
  }
  return response.data as T
}

export const apiGet = async <T>(
  path: string,
  signal?: AbortSignal,
): Promise<T> => {
  const response = await sendViaSW(
    { type: "focusquote.apiProxy", path, method: "GET" },
    signal,
  )
  if (!response.ok) {
    throw new ApiCallError(response.error, response.status)
  }
  return response.data as T
}

export const apiPut = async <T>(
  path: string,
  body: unknown,
  signal?: AbortSignal,
): Promise<T> => {
  const response = await sendViaSW(
    { type: "focusquote.apiProxy", path, method: "PUT", body },
    signal,
  )
  if (!response.ok) {
    throw new ApiCallError(response.error, response.status)
  }
  return response.data as T
}
