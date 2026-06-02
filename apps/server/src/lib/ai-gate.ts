import { eq } from "drizzle-orm"
import { db } from "../db/client"
import { userSettings } from "../db/schema"
import {
  isAiFeatureEnabled,
  type AiFeature,
  type AiGateSettings,
} from "@focus-quote/shared"

/**
 * Server-side AI gate (ADR 0002). Reads the user's master switch from
 * user_settings; absent a row, defaults to enabled. Consult before any
 * token-spending LLM call so a disabled feature never spends tokens.
 */
export const loadAiGateSettings = async (
  userId: string,
): Promise<AiGateSettings> => {
  const [row] = await db
    .select({
      aiMasterEnabled: userSettings.aiMasterEnabled,
      autoTitleEnabled: userSettings.autoTitleEnabled,
      aiFeatureOverrides: userSettings.aiFeatureOverrides,
    })
    .from(userSettings)
    .where(eq(userSettings.userId, userId))
    .limit(1)
  if (!row) return { masterEnabled: true }
  return {
    masterEnabled: row.aiMasterEnabled,
    featureOverrides: {
      ...row.aiFeatureOverrides,
      autoTitle: row.autoTitleEnabled,
    },
  }
}

export const aiFeatureEnabledForUser = async (
  userId: string,
  feature: AiFeature,
): Promise<boolean> =>
  isAiFeatureEnabled(feature, await loadAiGateSettings(userId))
