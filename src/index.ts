import type { Plugin } from "@opencode-ai/plugin"
import { resolveConfig } from "./config.js"
import { createCorrectionHandler } from "./correction.js"
import { createPhrasesHandler } from "./phrases.js"

export const EnglishLearn: Plugin = async ({ client, directory }) => {
  // Resolve config — if small_model is missing or plugin is disabled, return no-op hooks
  const resolved = await resolveConfig(directory, client as any)
  if (!resolved) {
    console.warn("[english-learn] plugin disabled (no small_model or disabled in config)")
    return {}
  }

  const { plugin: config, smallModel } = resolved

  const deps = {
    client: client as any,
    directory,
    smallModel,
    config,
  }

  const correctionHandler = createCorrectionHandler(deps)
  const phrasesHandler = createPhrasesHandler(deps)

  return {
    "chat.message": async (input, output) => {
      try {
        await correctionHandler(input as any, output as any)
      } catch (err) {
        console.error("[english-learn] chat.message hook error (suppressed):", err)
      }
    },

    event: async ({ event }) => {
      try {
        await phrasesHandler(event as any)
      } catch (err) {
        console.error("[english-learn] event hook error (suppressed):", err)
      }
    },
  }
}
