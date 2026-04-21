import { isPureEnglish, extractTextParts, wordCount } from "./guards.js"
import { analyze } from "./analyze.js"
import { buildCorrectionPrompts, parseCorrectionResponse } from "./prompts/correction.js"
import { showCorrectionTip } from "./toast.js"
import { notifyError } from "./notify.js"
import type { PluginConfig } from "./config.js"

const MIN_WORD_COUNT = 4

// Tracks in-flight analysis per session. The AbortController is used to discard
// stale results after analysis completes (not to cancel in-flight SDK requests),
// since the opencode SDK may not support AbortSignal.
const inFlight = new Map<string, AbortController>()

interface CorrectionDeps {
  client: Parameters<typeof analyze>[0]["client"]
  directory: string
  smallModel: { providerID: string; modelID: string }
  config: PluginConfig
}

export function createCorrectionHandler(deps: CorrectionDeps) {
  return async (
    input: { sessionID: string },
    output: { parts: Array<{ type: string; text?: string }> },
  ): Promise<void> => {
    if (!deps.config.correction.enabled) return

    const text = extractTextParts(output.parts as any)
    if (!text || !isPureEnglish(text) || wordCount(text) < MIN_WORD_COUNT) return

    const { sessionID } = input

    // Cancel any previous in-flight analysis for this session
    const prev = inFlight.get(sessionID)
    if (prev) prev.abort()
    const controller = new AbortController()
    inFlight.set(sessionID, controller)

    // Fire-and-forget
    ;(async () => {
      try {
        const { system, user } = buildCorrectionPrompts(text)
        const raw = await analyze(
          { client: deps.client, directory: deps.directory, smallModel: deps.smallModel },
          system,
          user,
        )

        // Discard if superseded
        if (controller.signal.aborted) return

        if (raw === ("__RATE_LIMITED__" as any)) {
          notifyError("English plugin: rate limited, will retry next time")
          return
        }
        if (raw === ("__AUTH_ERROR__" as any)) {
          notifyError("English plugin: auth error, analysis disabled for session")
          return
        }

        const result = parseCorrectionResponse(raw ?? "")
        if (!result) return

        await showCorrectionTip(deps.client as any, deps.config, result)
      } catch (err) {
        console.error("[english-learn] correction handler error:", err)
      } finally {
        // Only delete if this is still the current controller (avoid wiping a newer one)
        if (inFlight.get(sessionID) === controller) {
          inFlight.delete(sessionID)
        }
      }
    })()
  }
}
