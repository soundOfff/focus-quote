import type { StateStorage } from "zustand/middleware"
import { apiGet, apiPut } from "../toolbar/api"

const HOT_KEY_PREFIX = "focusquote.store."

const readSessionStorage = (name: string): string | null => {
  try {
    return sessionStorage.getItem(`${HOT_KEY_PREFIX}${name}`)
  } catch {
    return null
  }
}

const writeSessionStorage = (name: string, value: string): void => {
  try {
    sessionStorage.setItem(`${HOT_KEY_PREFIX}${name}`, value)
  } catch {
    // Ignore private-mode quota failures.
  }
}

const removeSessionStorage = (name: string): void => {
  try {
    sessionStorage.removeItem(`${HOT_KEY_PREFIX}${name}`)
  } catch {
    // noop
  }
}

/**
 * Cross-device sync for toolbar runtime state via `/api/toolbar-state/:name`.
 * Mirrors writes from `sessionStorage`/`chrome.storage.session` onto the
 * server so the toolbar can resume on a different device/install. We
 * fire-and-forget; local storage stays the synchronous source of truth.
 */
const remoteName = (name: string): string =>
  encodeURIComponent(name).slice(0, 80)

const pushRemote = (name: string, payload: string): void => {
  void apiPut(`/api/toolbar-state/${remoteName(name)}`, { payload }).catch(
    () => {},
  )
}

const pullRemote = async (name: string): Promise<string | null> => {
  try {
    const res = await apiGet<{
      state: { payload: string; updatedAt: string } | null
    }>(`/api/toolbar-state/${remoteName(name)}`)
    return res.state?.payload ?? null
  } catch {
    return null
  }
}

export const dualSessionStorage: StateStorage = {
  getItem: async (name) => {
    const hot = readSessionStorage(name)
    if (hot !== null) return hot
    try {
      const key = `${HOT_KEY_PREFIX}${name}`
      const out = await chrome.storage.session.get(key)
      const cold = out?.[key]
      if (typeof cold === "string") {
        writeSessionStorage(name, cold)
        return cold
      }
    } catch {
      // noop
    }
    const remote = await pullRemote(name)
    if (remote !== null) {
      writeSessionStorage(name, remote)
      const key = `${HOT_KEY_PREFIX}${name}`
      void chrome.storage.session.set({ [key]: remote }).catch(() => {})
      return remote
    }
    return null
  },
  setItem: (name, value) => {
    writeSessionStorage(name, value)
    const key = `${HOT_KEY_PREFIX}${name}`
    void chrome.storage.session.set({ [key]: value }).catch(() => {})
    pushRemote(name, value)
  },
  removeItem: (name) => {
    removeSessionStorage(name)
    const key = `${HOT_KEY_PREFIX}${name}`
    void chrome.storage.session.remove(key).catch(() => {})
    // Represent removal as an empty payload upstream so other devices know
    // the toolbar state was cleared without us adding a dedicated endpoint.
    pushRemote(name, "")
  },
}
