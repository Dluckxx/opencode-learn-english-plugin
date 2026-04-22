import type { Plugin } from "@opencode-ai/plugin"
import { resolveConfig } from "./config.js"
import { createCorrectionHandler } from "./correction.js"
import { createPhrasesHandler } from "./phrases.js"

export const EnglishLearn: Plugin = ({ client, directory }) => {
  // Lazy config resolution — done on first hook call, not during plugin init.
  // This avoids blocking opencode startup if the SDK client isn't fully ready.
  let resolved: Awaited<ReturnType<typeof resolveConfig>> | undefined
  let initPromise: Promise<void> | null = null
  let correctionHandler: ReturnType<typeof createCorrectionHandler> | null = null
  let phrasesHandler: ReturnType<typeof createPhrasesHandler> | null = null

  async function ensureConfig(): Promise<boolean> {
    if (resolved !== undefined) return resolved !== null
    if (initPromise) {
      await initPromise
      return resolved !== null
    }

    initPromise = (async () => {
      try {
        resolved = await resolveConfig(directory, client as any)
        if (!resolved) {
          console.warn("[english-learn] plugin disabled (no small_model or disabled in config)")
          return
        }
        const deps = {
          client: client as any,
          directory,
          smallModel: resolved.smallModel,
          config: resolved.plugin,
        }
        correctionHandler = createCorrectionHandler(deps)
        phrasesHandler = createPhrasesHandler(deps)
      } catch (err) {
        console.error("[english-learn] config resolution failed:", err)
        resolved = null
      }
    })()

    await initPromise
    return resolved !== null
  }

  return {
    "chat.message": async (input, output) => {
      try {
        if (!(await ensureConfig())) return
        await correctionHandler!(input as any, output as any)
      } catch (err) {
        console.error("[english-learn] chat.message hook error (suppressed):", err)
      }
    },

    event: async ({ event }) => {
      try {
        if (!(await ensureConfig())) return
        await phrasesHandler!(event as any)
      } catch (err) {
        console.error("[english-learn] event hook error (suppressed):", err)
      }
    },
  }
}
