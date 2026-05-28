import { isAiFeatureEnabled, type AiFeature } from "@focus-quote/shared"
import { PREFS_KEY } from "../../shared/prefs"

/**
 * Toolbar-side AI gate. Reads the local prefs master switch from
 * `chrome.storage.local` and applies the shared tiered resolver. Fails open
 * (enabled) if prefs can't be read, so a storage hiccup never silently blocks
 * a feature the user has enabled.
 */
export const aiFeatureEnabled = async (feature: AiFeature): Promise<boolean> => {
  try {
    const out = await chrome.storage.local.get(PREFS_KEY)
    const prefs = out[PREFS_KEY] as Record<string, unknown> | undefined
    const masterEnabled =
      typeof prefs?.aiMasterEnabled === "boolean" ? prefs.aiMasterEnabled : true
    return isAiFeatureEnabled(feature, { masterEnabled })
  } catch {
    return true
  }
}
