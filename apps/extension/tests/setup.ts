/**
 * Provides a minimal in-memory mock of `chrome.storage.local` and
 * `chrome.runtime.lastError` so unit tests can exercise code that uses
 * the chrome.* APIs without a real browser.
 */
type StorageData = Record<string, unknown>

const store: StorageData = {}
const sessionStore: StorageData = {}
const browserSessionStorage: StorageData = {}

const pickKeys = (
  s: StorageData,
  keys: string | string[] | null,
): StorageData => {
  if (keys === null || keys === undefined) return { ...s }
  const list = Array.isArray(keys) ? keys : [keys]
  const out: StorageData = {}
  for (const k of list) if (k in s) out[k] = s[k]
  return out
}

const chromeMock = {
  runtime: { lastError: undefined as { message?: string } | undefined },
  storage: {
    local: {
      get: (
        keys: string | string[] | null,
        cb: (got: StorageData) => void,
      ) => {
        queueMicrotask(() => cb(pickKeys(store, keys)))
      },
      set: (items: StorageData, cb?: () => void) => {
        Object.assign(store, items)
        if (cb) queueMicrotask(cb)
      },
      remove: (keys: string | string[], cb?: () => void) => {
        const list = Array.isArray(keys) ? keys : [keys]
        for (const k of list) delete store[k]
        if (cb) queueMicrotask(cb)
      },
      clear: (cb?: () => void) => {
        for (const k of Object.keys(store)) delete store[k]
        if (cb) queueMicrotask(cb)
      },
    },
    session: {
      get: (keys: string | string[] | null, cb?: (got: StorageData) => void) => {
        const data = pickKeys(sessionStore, keys)
        if (typeof cb === "function") {
          queueMicrotask(() => cb(data))
          return
        }
        return Promise.resolve(data)
      },
      set: (items: StorageData, cb?: () => void) => {
        Object.assign(sessionStore, items)
        if (cb) {
          queueMicrotask(cb)
          return
        }
        return Promise.resolve()
      },
      remove: (keys: string | string[], cb?: () => void) => {
        const list = Array.isArray(keys) ? keys : [keys]
        for (const k of list) delete sessionStore[k]
        if (cb) {
          queueMicrotask(cb)
          return
        }
        return Promise.resolve()
      },
      clear: (cb?: () => void) => {
        for (const k of Object.keys(sessionStore)) delete sessionStore[k]
        if (cb) {
          queueMicrotask(cb)
          return
        }
        return Promise.resolve()
      },
    },
  },
}

;(globalThis as unknown as { chrome: unknown }).chrome = chromeMock
;(globalThis as unknown as { sessionStorage: Storage }).sessionStorage = {
  getItem: (k: string) => (k in browserSessionStorage ? String(browserSessionStorage[k]) : null),
  setItem: (k: string, v: string) => {
    browserSessionStorage[k] = v
  },
  removeItem: (k: string) => {
    delete browserSessionStorage[k]
  },
  clear: () => {
    for (const k of Object.keys(browserSessionStorage)) delete browserSessionStorage[k]
  },
  key: (i: number) => Object.keys(browserSessionStorage)[i] ?? null,
  get length() {
    return Object.keys(browserSessionStorage).length
  },
} as Storage

export const resetChromeStorage = () => {
  for (const k of Object.keys(store)) delete store[k]
  for (const k of Object.keys(sessionStore)) delete sessionStore[k]
  for (const k of Object.keys(browserSessionStorage)) delete browserSessionStorage[k]
  chromeMock.runtime.lastError = undefined
}

export const setChromeLastError = (message: string | undefined) => {
  chromeMock.runtime.lastError = message ? { message } : undefined
}
