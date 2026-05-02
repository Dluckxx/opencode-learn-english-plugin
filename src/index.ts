/**
 * opencode English Learning Plugin — v2 (system-prompt injection)
 *
 * Prior v1 ran a separate small-model analysis over direct HTTP and surfaced
 * tips via `tui.showToast`. That fought the toast channel with other plugins
 * (oh-my-openagent spams ~100ms toasts during a turn) and the correction
 * tip was effectively invisible. See docs/handoff/ for the full debugging
 * trail.
 *
 * v2 is ~100x simpler: we inject an "English tutor" instruction into the
 * system prompt on every real user turn (not title generation / small-model
 * helpers). The main LLM then appends a tips block to the END of its own
 * reply, inline with the conversation. No background analysis, no separate
 * credentials, no toast queue, no race conditions.
 *
 * Hook used: `experimental.chat.system.transform`. See:
 *   opencode/packages/opencode/src/session/llm.ts:85-89
 */
import type { Plugin } from "@opencode-ai/plugin"
import { readPluginConfig } from "./config.js"
import { ENGLISH_TIPS_INSTRUCTION } from "./tips-instruction.js"

const COMPACTION_CONTEXT_INSTRUCTION = `
When generating the continuation summary, omit terminal language-learning feedback blocks from assistant replies. Do not preserve, summarize, quote, or regenerate that feedback in compacted/session-summary content.
`

const HELPER_SYSTEM_PROMPT_PATTERNS = [
  /\bcompact(?:ed|ing|ion)?\b/i,
  /\bcontinuation (?:prompt|summary|context)\b/i,
  /\bsummar(?:y|ize|ise|izing|ising)\b/i,
  /\btitle generation\b/i,
  /\bgenerate (?:a )?title\b/i,
]

const ENGLISH_TIPS_BLOCK_PATTERN =
  /`★ English Tips ─[^`]*`[\s\S]*?`─+`/g

function isHelperSystemPrompt(system: string[]) {
  const text = system.join("\n")
  return HELPER_SYSTEM_PROMPT_PATTERNS.some((pattern) => pattern.test(text))
}

function stripEnglishTipsBlocks(text: string) {
  return text.replace(ENGLISH_TIPS_BLOCK_PATTERN, "").trim()
}

export const EnglishLearn: Plugin = async ({ directory }) => {
  // Config resolution is synchronous file I/O — fast enough to do on plugin
  // construction. The previous version deferred this to avoid blocking the
  // startup sequence; we've measured it and it's sub-millisecond.
  const config = readPluginConfig(directory)

  // Track the primary (main) session. The first real LLM call we see is
  // the main conversation; sub-agents spawned later get distinct session IDs
  // and should NOT receive the tutor instruction — tips in sub-agent output
  // are noise and waste tokens.
  let primarySessionId: string | null = null

  return {
    "experimental.chat.system.transform": async (input, output) => {
      if (!config.enabled) return

      // Skip short-lived helper calls (title generation, compaction summary,
      // conversation summarization, etc.). They pass an empty `system` array
      // because they don't use the full agent prompt. We only want to teach
      // during real user turns.
      if (output.system.length === 0) return

      // Some helper agents (notably compaction / continuation summarizers)
      // can run in the same session and still have a non-empty system prompt.
      // They are not visible primary-agent replies, so do not teach there.
      if (isHelperSystemPrompt(output.system)) return

      // Lock onto the first session we see as the primary conversation.
      // Any subsequent session with a different ID is a sub-agent — skip it.
      const sessionId = input.sessionID
      if (primarySessionId === null) {
        if (sessionId === undefined) return
        primarySessionId = sessionId
      }
      if (sessionId !== primarySessionId) return

      // Append our tutor instruction to the last block so provider-level
      // prompt caching isn't disturbed — opencode packs the rest of the
      // system prompt into `output.system[last]` downstream of this hook,
      // and adding to its tail leaves the cached prefix intact.
      const last = output.system.length - 1
      output.system[last] = output.system[last] + ENGLISH_TIPS_INSTRUCTION
    },

    "experimental.session.compacting": async (_input, output) => {
      if (!config.enabled) return

      output.context = output.context.map(stripEnglishTipsBlocks)
      output.context.push(COMPACTION_CONTEXT_INSTRUCTION)
    },
  }
}
