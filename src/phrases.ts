import { isPureEnglish, extractTextParts } from "./guards.js"
import { analyze } from "./analyze.js"
import { buildPhrasesPrompts, parsePhrasesResponse } from "./prompts/phrases.js"
import { showPhrasesTip } from "./toast.js"
import { notifyError } from "./notify.js"
import type { PluginConfig } from "./config.js"

// Tracks the last-processed assistant message ID per session to avoid re-processing
const lastProcessedId = new Map<string, string>()
// Tracks in-flight analysis per session (post-hoc discard only)
const inFlight = new Map<string, AbortController>()
// Tracks which message ID is currently being analyzed per session
const pendingId = new Map<string, string>()

interface PhrasesDeps {
  client: Parameters<typeof analyze>[0]["client"]
  directory: string
  smallModel: { providerID: string; modelID: string }
  config: PluginConfig
}

export function createPhrasesHandler(deps: PhrasesDeps) {
  return async (event: {
    type: string
    properties: {
      sessionID: string
      status?: { type: string }
    }
  }): Promise<void> => {
    // Only handle session.status with idle — ignore deprecated session.idle
    if (event.type !== "session.status") return
    if (event.properties.status?.type !== "idle") return
    if (!deps.config.phrases.enabled) return

    const { sessionID } = event.properties

    try {
      // Fetch messages for this session
      const result = await deps.client.session.messages({
        path: { id: sessionID },
        query: { directory: deps.directory },
      })

      if (result.error) {
        console.error("[english-learn] failed to fetch messages:", result.error)
        return
      }

      const messages = result.data
      if (!messages || messages.length === 0) return

      // Find the last assistant message
      let assistantMsg: {
        info: { id?: string; role: string; error?: unknown }
        parts: Array<{ type: string; text?: string }>
      } | null = null

      for (let i = messages.length - 1; i >= 0; i--) {
        if (messages[i].info.role === "assistant") {
          assistantMsg = messages[i]
          break
        }
      }

      if (!assistantMsg) return

      // Skip if this message has been processed already
      const msgId = assistantMsg.info.id
      if (msgId && lastProcessedId.get(sessionID) === msgId) return

      // Skip if the message has an error
      if (assistantMsg.info.error) return

      const text = extractTextParts(assistantMsg.parts as any)
      if (!text || !isPureEnglish(text)) return

      // Skip if this exact message is already being analyzed
      if (msgId && pendingId.get(sessionID) === msgId) return
      if (msgId) pendingId.set(sessionID, msgId)

      // Cancel any previous in-flight analysis for this session
      const prev = inFlight.get(sessionID)
      if (prev) prev.abort()
      const controller = new AbortController()
      inFlight.set(sessionID, controller)

      // Fire-and-forget
      ;(async () => {
        try {
          const { system, user } = buildPhrasesPrompts(text)
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

          const result = parsePhrasesResponse(raw ?? "")
          if (!result) return

          // Only mark as processed after successful parsing
          if (msgId) lastProcessedId.set(sessionID, msgId)

          await showPhrasesTip(deps.client as any, deps.config, result)
        } catch (err) {
          console.error("[english-learn] phrases handler error:", err)
        } finally {
          if (inFlight.get(sessionID) === controller) {
            inFlight.delete(sessionID)
          }
          if (pendingId.get(sessionID) === msgId) {
            pendingId.delete(sessionID)
          }
        }
      })()
    } catch (err) {
      console.error("[english-learn] phrases handler error (fetch):", err)
    }
  }
}
