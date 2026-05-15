import type { StateStorage } from "zustand/middleware"

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
    return null
  },
  setItem: (name, value) => {
    writeSessionStorage(name, value)
    const key = `${HOT_KEY_PREFIX}${name}`
    void chrome.storage.session.set({ [key]: value }).catch(() => {})
  },
  removeItem: (name) => {
    removeSessionStorage(name)
    const key = `${HOT_KEY_PREFIX}${name}`
    void chrome.storage.session.remove(key).catch(() => {})
  },
}
