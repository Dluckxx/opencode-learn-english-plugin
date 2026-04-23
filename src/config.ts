/**
 * Minimal config layer — the plugin now has a single on/off switch.
 *
 * Prior version resolved `small_model` from opencode's SDK config and parsed
 * a nested `experimental.english_learn` block. Both are gone now that tips
 * piggyback on the main LLM via a system-prompt injection: no background
 * analysis, no toast durations, no provider auth.
 *
 * The plugin reads `experimental.english_learn.enabled` (default true) from
 * the project's opencode.json. If the block is missing or parse fails, the
 * plugin stays enabled — same friendly default as before.
 */
import { readFileSync, existsSync } from "fs"
import { join } from "path"

export interface PluginConfig {
  enabled: boolean
}

const DEFAULT_CONFIG: PluginConfig = { enabled: true }

/** Strip // line comments and /* block comments *\/ while respecting string literals. */
function stripJsoncComments(text: string): string {
  let result = ""
  let inString = false
  let escapeNext = false
  let i = 0
  while (i < text.length) {
    const char = text[i]
    const next = text[i + 1]

    if (escapeNext) {
      result += char
      escapeNext = false
      i++
      continue
    }

    if (char === "\\" && inString) {
      result += char
      escapeNext = true
      i++
      continue
    }

    if (char === '"') {
      inString = !inString
      result += char
      i++
      continue
    }

    if (!inString && char === "/" && next === "/") {
      while (i < text.length && text[i] !== "\n" && text[i] !== "\r") i++
      continue
    }

    if (!inString && char === "/" && next === "*") {
      i += 2
      while (i < text.length) {
        if (text[i] === "*" && text[i + 1] === "/") {
          i += 2
          break
        }
        i++
      }
      continue
    }

    result += char
    i++
  }
  return result
}

export function readPluginConfig(directory: string): PluginConfig {
  for (const filename of ["opencode.jsonc", "opencode.json"]) {
    const filepath = join(directory, filename)
    if (!existsSync(filepath)) continue
    try {
      const raw = readFileSync(filepath, "utf-8")
      const json = JSON.parse(stripJsoncComments(raw))
      const block = json?.experimental?.english_learn
      if (!block) return DEFAULT_CONFIG
      return { enabled: block.enabled ?? DEFAULT_CONFIG.enabled }
    } catch (err) {
      console.warn("[english-learn] failed to parse config, using defaults:", err)
      return DEFAULT_CONFIG
    }
  }
  return DEFAULT_CONFIG
}
